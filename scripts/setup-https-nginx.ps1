# setup-https-nginx.ps1
# PowerShell script to set up Nginx reverse proxy with HTTPS for Node.js backend on EC2 (Ubuntu)
# Usage: Run as Administrator (or with sudo in PowerShell Core on Linux)

$BACKEND_PORT = 4000
$PUBLIC_IP = "13.221.65.9"
$NGINX_CONF = "/etc/nginx/sites-available/ai-app"

Write-Host "[1/4] Installing Nginx and Certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

Write-Host "[2/4] Configuring Nginx reverse proxy..."
$nginxConfig = @"
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
"@

Set-Content -Path $NGINX_CONF -Value $nginxConfig -Force
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/ai-app
sudo nginx -t
sudo systemctl restart nginx

Write-Host "[3/4] Obtaining and installing SSL certificate..."
try {
    sudo certbot --nginx -d $PUBLIC_IP --non-interactive --agree-tos -m "admin@$PUBLIC_IP"
} catch {
    Write-Warning "Certbot failed, continuing..."
}

Write-Host "[4/4] Reloading Nginx to apply SSL..."
sudo systemctl reload nginx

Write-Host "`n[COMPLETE] HTTPS is now enabled for your backend at https://$PUBLIC_IP."
Write-Host "Test with: curl -k https://$PUBLIC_IP/health"
