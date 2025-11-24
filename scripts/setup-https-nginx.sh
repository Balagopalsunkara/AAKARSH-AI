#!/bin/bash
# setup-https-nginx.sh
# Script to set up Nginx reverse proxy with HTTPS for your Node.js backend on EC2
# Usage: sudo ./setup-https-nginx.sh

set -e

BACKEND_PORT=4000
PUBLIC_IP="13.221.65.9"
NGINX_CONF="/etc/nginx/sites-available/ai-app"

# 1. Install Nginx and Certbot
apt update
apt install -y nginx certbot python3-certbot-nginx

# 2. Configure Nginx reverse proxy
cat > $NGINX_CONF <<EOF
server {
    listen 80;
    server_name $PUBLIC_IP;

    location / {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf $NGINX_CONF /etc/nginx/sites-enabled/ai-app
nginx -t
systemctl restart nginx

# 3. Obtain and install SSL certificate
certbot --nginx -d $PUBLIC_IP --non-interactive --agree-tos -m admin@$PUBLIC_IP || true

# 4. Reload Nginx to apply SSL
systemctl reload nginx

echo "\n[COMPLETE] HTTPS is now enabled for your backend at https://$PUBLIC_IP."
echo "Test with: curl -k https://$PUBLIC_IP/health"
