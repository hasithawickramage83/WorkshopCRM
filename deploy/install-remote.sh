#!/bin/bash
set -euo pipefail

APP_DIR="/opt/ceylon-crm"
DOMAIN="csm.ceylonautomobile.co.nz"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

echo "==> Installing Ceylon CRM to ${APP_DIR}"
mkdir -p "${APP_DIR}"
cd "${APP_DIR}"

if [ ! -f .env ]; then
  echo "ERROR: .env file missing in ${APP_DIR}"
  exit 1
fi

# Update APP_URL for production
sed -i "s|^APP_URL=.*|APP_URL=https://${DOMAIN}|" .env || echo "APP_URL=https://${DOMAIN}" >> .env

echo "==> Building and starting Docker containers (ports 5020 backend, 8097 frontend)"
docker compose -f docker-compose.prod.yml down 2>/dev/null || true
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

echo "==> Waiting for backend health..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:5020/health >/dev/null 2>&1; then
    echo "Backend is healthy"
    break
  fi
  sleep 2
done

echo "==> Seeding database (if needed)..."
docker compose -f docker-compose.prod.yml exec -T backend npx prisma db push 2>/dev/null || true

echo "==> Configuring nginx for ${DOMAIN}"
cp deploy/nginx/csm.ceylonautomobile.co.nz.conf "${NGINX_AVAILABLE}"
ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
nginx -t
systemctl reload nginx

echo "==> Ensuring SSL certificate is deployed to nginx"
certbot --nginx -d "${DOMAIN}" --non-interactive --redirect 2>/dev/null || {
  echo "Certbot deploy failed — ensure DNS for ${DOMAIN} points to this server, then run:"
  echo "  certbot --nginx -d ${DOMAIN}"
}

echo ""
echo "==> Deployment complete!"
echo "    App URL:  https://${DOMAIN}"
echo "    Backend:  http://127.0.0.1:5020 (localhost only)"
echo "    Frontend: http://127.0.0.1:8097 (localhost only)"
echo "    Login:    admin@ceylonautomobile.co.nz / Admin@123"
curl -sf http://127.0.0.1:5020/health && echo "" || echo "Health check pending..."
