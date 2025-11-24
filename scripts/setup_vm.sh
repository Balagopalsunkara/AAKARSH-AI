#!/usr/bin/env bash
set -euo pipefail

PKG_MANAGER=""

usage() {
  cat <<'EOF'
Usage: sudo ./setup_vm.sh [options]

Options:
  --domain <name>            Public domain for frontend (required)
  --api-host <name>          Optional separate hostname for API (defaults to domain)
  --repo <url>               Git repository URL (defaults to https://github.com/Balagopalsunkara/AI-APP.git)
  --app-dir <path>           Install directory (defaults to /opt/ai-app)
  --branch <name>            Git branch to deploy (defaults to main)
  --skip-certbot             Skip Certbot TLS setup

Example:
  sudo ./setup_vm.sh --domain example.com --api-host api.example.com
EOF
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "[!] Run this script with sudo or as root" >&2
    exit 1
  fi
}

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    PKG_MANAGER="apt"
  elif command -v yum >/dev/null 2>&1; then
    PKG_MANAGER="yum"
  else
    echo "[!] Supported package manager not found (apt-get or yum)." >&2
    exit 1
  fi
}

parse_args() {
  DOMAIN=""
  API_HOST=""
  REPO_URL="https://github.com/Balagopalsunkara/AI-APP.git"
  APP_DIR="/opt/ai-app"
  BRANCH="main"
  SKIP_CERTBOT=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain)
        DOMAIN="$2"; shift 2 ;;
      --api-host)
        API_HOST="$2"; shift 2 ;;
      --repo)
        REPO_URL="$2"; shift 2 ;;
      --app-dir)
        APP_DIR="$2"; shift 2 ;;
      --branch)
        BRANCH="$2"; shift 2 ;;
      --skip-certbot)
        SKIP_CERTBOT=true; shift ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        echo "[!] Unknown option: $1" >&2
        usage
        exit 1 ;;
    esac
  done

  if [[ -z "${DOMAIN}" ]]; then
    echo "[!] --domain is required" >&2
    usage
    exit 1
  fi

  if [[ -z "${API_HOST}" ]]; then
    API_HOST="${DOMAIN}"
  fi
}

install_prereqs() {
  if [[ "${PKG_MANAGER}" == "apt" ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get upgrade -y
    apt-get install -y build-essential git curl nginx ufw
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    yum update -y
    # --allowerasing lets us replace curl-minimal with curl if the AMI ships with minimal
    yum install -y --allowerasing gcc-c++ make git curl nginx firewalld
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
    systemctl enable nginx
    systemctl start nginx
  fi

  npm install -g pm2
}

clone_repo() {
  if [[ -d "${APP_DIR}" ]]; then
    echo "[*] ${APP_DIR} exists, pulling latest changes"
    git -C "${APP_DIR}" fetch --all
    git -C "${APP_DIR}" reset --hard "origin/${BRANCH}"
  else
    git clone "${REPO_URL}" "${APP_DIR}"
    git -C "${APP_DIR}" checkout "${BRANCH}"
  fi
}

configure_env_files() {
  pushd "${APP_DIR}/backend" >/dev/null
  cp -n .env.example .env || true
  popd >/dev/null

  pushd "${APP_DIR}/frontend" >/dev/null
  cp -n .env.example .env || true
  if ! grep -q '^NEXT_PUBLIC_API_URL=' .env; then
    echo "NEXT_PUBLIC_API_URL=https://${API_HOST}" >> .env
  else
    sed -i "s#^NEXT_PUBLIC_API_URL=.*#NEXT_PUBLIC_API_URL=https://${API_HOST}#" .env
  fi
  popd >/dev/null

  echo "[!] Update ${APP_DIR}/backend/.env with required secrets before starting services"
}

install_backend() {
  pushd "${APP_DIR}/backend" >/dev/null
  npm install
  popd >/dev/null
}

install_frontend() {
  pushd "${APP_DIR}/frontend" >/dev/null
  npm install
  npm run build
  popd >/dev/null
}

configure_pm2() {
  pm2 delete ai-app-backend >/dev/null 2>&1 || true
  pm2 delete ai-app-frontend >/dev/null 2>&1 || true

  pm2 start "${APP_DIR}/backend/server.js" --name ai-app-backend --cwd "${APP_DIR}/backend" --env production
  pm2 start "npm" --name ai-app-frontend --cwd "${APP_DIR}/frontend" -- run start
  pm2 save

  TARGET_USER="${SUDO_USER:-root}"
  TARGET_HOME=$(eval echo ~"${TARGET_USER}")
  STARTUP_CMD=$(pm2 startup systemd -u "${TARGET_USER}" --hp "${TARGET_HOME}" | grep -E "pm2 startup" -m1 || true)
  if [[ -n "${STARTUP_CMD}" ]]; then
    eval "${STARTUP_CMD}"
  fi
}

configure_nginx() {
  if [[ -d /etc/nginx/sites-available ]]; then
    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
    CONFIG_PATH=/etc/nginx/sites-available/ai-app.conf
  else
    mkdir -p /etc/nginx/conf.d
    CONFIG_PATH=/etc/nginx/conf.d/ai-app.conf
  fi

  cat > "${CONFIG_PATH}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location /api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }

    location /metrics {
        proxy_pass http://127.0.0.1:4000/metrics;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

  if [[ "${CONFIG_PATH}" == /etc/nginx/sites-available/* ]]; then
    ln -sf /etc/nginx/sites-available/ai-app.conf /etc/nginx/sites-enabled/ai-app.conf
    rm -f /etc/nginx/sites-enabled/default
  else
    rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
  fi

  nginx -t
  systemctl reload nginx
}

configure_firewall() {
  if [[ "${PKG_MANAGER}" == "apt" ]]; then
    ufw allow OpenSSH
    ufw allow 'Nginx Full'
    ufw --force enable
  elif command -v firewall-cmd >/dev/null 2>&1; then
    systemctl enable firewalld
    systemctl start firewalld
    firewall-cmd --permanent --add-service=ssh
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
  else
    echo "[!] Firewall configuration skipped (firewalld/ufw not available)." >&2
  fi
}

run_certbot() {
  if ${SKIP_CERTBOT}; then
    echo "[!] TLS left unconfigured. Run certbot manually when ready."
    return
  fi

  if [[ "${PKG_MANAGER}" == "apt" ]]; then
    apt-get install -y certbot python3-certbot-nginx
  else
    if command -v amazon-linux-extras >/dev/null 2>&1; then
      amazon-linux-extras install epel -y
    fi
    yum install -y certbot python3-certbot-nginx || true
  fi

  certbot --nginx -d "${DOMAIN}" $( [[ "${API_HOST}" != "${DOMAIN}" ]] && printf ' -d %s' "${API_HOST}" ) --non-interactive --agree-tos -m "admin@${DOMAIN}" || true
}

summary() {
  cat <<EOF
[Done] Base deployment complete.

Next actions:
  1. Edit ${APP_DIR}/backend/.env with API keys and secrets.
  2. Restart backend with: pm2 restart ai-app-backend
  3. Validate health at https://${DOMAIN}/api/v1/status and https://${DOMAIN}/health
  4. Review Nginx logs at /var/log/nginx/ and PM2 logs via pm2 logs
EOF
}

main() {
  require_root
  detect_package_manager
  parse_args "$@"
  install_prereqs
  clone_repo
  configure_env_files
  install_backend
  install_frontend
  configure_pm2
  configure_nginx
  configure_firewall
  run_certbot
  summary
}

main "$@"
