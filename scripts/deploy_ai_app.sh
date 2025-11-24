#!/usr/bin/env bash
# CloudShell deployment helper for AI-APP App Runner services.

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./deploy_ai_app.sh -a <codeconnections-arn> [-r <region>] [-p <aws-profile>] [-b <branch>]
  -a  Required. ARN of your AWS CodeConnections / App Runner GitHub connection.
  -r  AWS region (default: ap-south-1).
  -p  AWS profile configured in CloudShell (default: ai-app).
  -b  Git branch to deploy (default: main).
Environment:
  GITHUB_TOKEN  Optional. If set, used for git clone/fetch authentication.
USAGE
  exit 1
}

REGION="ap-south-1"
PROFILE="ai-app"
BRANCH="main"
CONNECTION_ARN=""
REPO_URL="https://github.com/Balagopalsunkara/AI-APP.git"
WORKDIR="$HOME/AI-APP"
MODULE_DIR="$WORKDIR/infrastructure/terraform/apprunner_github"

while getopts "a:r:p:b:h" opt; do
  case "$opt" in
    a) CONNECTION_ARN="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    p) PROFILE="$OPTARG" ;;
    b) BRANCH="$OPTARG" ;;
    h|*) usage ;;
  esac

done

[[ -z "$CONNECTION_ARN" ]] && usage

export AWS_PROFILE="$PROFILE"
export AWS_REGION="$REGION"

install_terraform_from_repo() {
  if command -v dnf >/dev/null 2>&1; then
    if ! sudo dnf config-manager --help >/dev/null 2>&1; then
      sudo dnf install -y dnf-plugins-core >/dev/null 2>&1 || sudo dnf install -y 'dnf-command(config-manager)' >/dev/null 2>&1 || return 1
    fi
    sudo dnf config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo >/dev/null || return 1
    sudo dnf install -y terraform >/dev/null || return 1
    return 0
  fi

  if command -v yum >/dev/null 2>&1; then
    sudo yum install -y yum-utils >/dev/null || return 1
    sudo yum-config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo >/dev/null || return 1
    sudo yum install -y terraform >/dev/null || return 1
    return 0
  fi

  return 1
}

install_terraform_from_zip() {
  local version="${1:-1.9.5}"
  local zip_url="https://releases.hashicorp.com/terraform/${version}/terraform_${version}_linux_amd64.zip"
  local tmp_zip tmp_dir
  tmp_zip="$(mktemp)"
  tmp_dir="$(mktemp -d)"

  if ! command -v curl >/dev/null 2>&1; then
    echo "[error] curl is required to download Terraform." >&2
    rm -f "$tmp_zip"
    rm -rf "$tmp_dir"
    return 1
  fi

  if ! curl -fsSL -o "$tmp_zip" "$zip_url"; then
    echo "[error] Failed to download Terraform from $zip_url" >&2
    rm -f "$tmp_zip"
    rm -rf "$tmp_dir"
    return 1
  fi

  if ! command -v unzip >/dev/null 2>&1; then
    if command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y unzip >/dev/null || true
    elif command -v yum >/dev/null 2>&1; then
      sudo yum install -y unzip >/dev/null || true
    fi
  fi

  if ! command -v unzip >/dev/null 2>&1; then
    echo "[error] unzip is required to extract Terraform." >&2
    rm -f "$tmp_zip"
    rm -rf "$tmp_dir"
    return 1
  fi

  unzip -o "$tmp_zip" -d "$tmp_dir" >/dev/null || {
    echo "[error] Failed to extract Terraform archive." >&2
    rm -f "$tmp_zip"
    rm -rf "$tmp_dir"
    return 1
  }

  mkdir -p "$HOME/bin"
  mv "$tmp_dir/terraform" "$HOME/bin/terraform"
  chmod +x "$HOME/bin/terraform"
  rm -f "$tmp_zip"
  rm -rf "$tmp_dir"
  export PATH="$HOME/bin:$PATH"
  echo "[setup] Installed Terraform ${version} to $HOME/bin/terraform"
  return 0
}

if ! command -v terraform >/dev/null 2>&1; then
  echo "[setup] Installing Terraform..."
  install_terraform_from_repo || install_terraform_from_zip || {
    echo "[error] Unable to install Terraform automatically." >&2
    exit 1
  }
fi

clone_url="$REPO_URL"
[[ -n "${GITHUB_TOKEN:-}" ]] && clone_url="https://${GITHUB_TOKEN}@github.com/Balagopalsunkara/AI-APP.git"

if [[ ! -d "$WORKDIR/.git" ]]; then
  echo "[setup] Cloning AI-APP repo..."
  git clone "$clone_url" "$WORKDIR"
else
  echo "[setup] Updating AI-APP repo..."
  git -C "$WORKDIR" fetch origin "$BRANCH"
  git -C "$WORKDIR" checkout "$BRANCH"
  git -C "$WORKDIR" pull origin "$BRANCH"
fi

if [[ ! -d "$MODULE_DIR" ]]; then
  echo "[error] Terraform module directory not found at $MODULE_DIR" >&2
  exit 1
fi

echo "[check] Verifying App Runner subscription..."
if ! OUTPUT="$(aws apprunner list-services --region "$REGION" 2>&1 >/tmp/apprunner_services.json)"; then
  if [[ "$OUTPUT" == *"SubscriptionRequiredException"* ]]; then
    echo "[error] App Runner is not yet activated in $REGION. Visit https://console.aws.amazon.com/apprunner/home?region=$REGION and click 'Get started' once, then rerun this script." >&2
    exit 1
  fi
  echo "$OUTPUT" >&2
  exit 1
fi

TFVARS_FILE="$(mktemp "$MODULE_DIR/deploy.auto.tfvars.json.XXXXXX")"
trap 'rm -f "$TFVARS_FILE"' EXIT

create_tfvars() {
  local backend_url="${1:-}"
  {
    printf '{\n'
    printf '  "aws_region": "%s",\n' "$REGION"
    printf '  "github_connection_arn": "%s"' "$CONNECTION_ARN"
    if [[ -n "$backend_url" ]]; then
      printf ',\n  "frontend_runtime_env": {\n'
      printf '    "NODE_ENV": "production",\n'
      printf '    "NEXT_PUBLIC_API_URL": "%s"\n' "$backend_url"
      printf '  }\n'
    else
      printf '\n'
    fi
    printf '}\n'
  } >"$TFVARS_FILE"
}

echo "[terraform] Initialising module..."
(
  cd "$MODULE_DIR"
  terraform init -input=false
)

create_tfvars

echo "[terraform] Applying stack (initial build)..."
(
  cd "$MODULE_DIR"
  terraform apply -input=false -auto-approve -var-file "$TFVARS_FILE"
)

BACKEND_URL="$(cd "$MODULE_DIR" && terraform output -raw backend_service_url 2>/dev/null || true)"

if [[ -n "$BACKEND_URL" && "$BACKEND_URL" != "https://replace-with-backend-url" ]]; then
  echo "[terraform] Updating frontend to target backend URL: $BACKEND_URL"
  create_tfvars "$BACKEND_URL"
  (
    cd "$MODULE_DIR"
    terraform apply -input=false -auto-approve -var-file "$TFVARS_FILE"
  )
else
  echo "[warn] Backend URL unavailable; skipping frontend env update."
fi

echo "[result] Deployment complete. Service endpoints:"
(
  cd "$MODULE_DIR"
  terraform output
)

echo "[next] Test backend: curl $(cd "$MODULE_DIR" && terraform output -raw backend_service_url)/health"
echo "[next] Visit frontend: $(cd "$MODULE_DIR" && terraform output -raw frontend_service_url)"
