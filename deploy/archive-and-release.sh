#!/bin/bash
set -euo pipefail

APP_DIR="/opt/ceylon-crm"
RELEASES_DIR="/opt/ceylon-crm-releases"
TARBALL="/tmp/csm-crm-deploy.tar.gz"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
REL="${RELEASES_DIR}/${STAMP}"

if [ ! -f "${TARBALL}" ]; then
  echo "ERROR: ${TARBALL} not found"
  exit 1
fi

echo "==> Archiving current production as ${STAMP}"
mkdir -p "${REL}"
cd "${APP_DIR}"

cp .env "${REL}/env.bak"
tar -czf "${REL}/source.tar.gz" \
  --exclude=node_modules \
  --exclude=backups \
  --exclude=.env \
  --exclude=.git \
  --exclude=dist \
  .

{
  echo "archived_at=${STAMP}"
  echo "app_dir=${APP_DIR}"
  docker inspect -f 'backend_image={{.Image}} backend_id={{.Id}}' csm-crm-backend 2>/dev/null || true
  docker inspect -f 'frontend_image={{.Image}} frontend_id={{.Id}}' csm-crm-frontend 2>/dev/null || true
} > "${REL}/images.txt"

if docker inspect csm-crm-backend >/dev/null 2>&1; then
  docker tag "$(docker inspect -f '{{.Image}}' csm-crm-backend)" "ceylon-crm-backend:${STAMP}"
  echo "tagged ceylon-crm-backend:${STAMP}" >> "${REL}/images.txt"
fi
if docker inspect csm-crm-frontend >/dev/null 2>&1; then
  docker tag "$(docker inspect -f '{{.Image}}' csm-crm-frontend)" "ceylon-crm-frontend:${STAMP}"
  echo "tagged ceylon-crm-frontend:${STAMP}" >> "${REL}/images.txt"
fi

cat > "${REL}/rollback.sh" <<EOF
#!/bin/bash
set -euo pipefail
echo "Rolling back to ${STAMP}"
cd "${APP_DIR}"
cp .env /tmp/ceylon-crm.env.bak
tar -xzf "${REL}/source.tar.gz"
mv /tmp/ceylon-crm.env.bak .env
if docker image inspect "ceylon-crm-backend:${STAMP}" >/dev/null 2>&1; then
  docker tag "ceylon-crm-backend:${STAMP}" ceylon-crm-backend:latest
fi
if docker image inspect "ceylon-crm-frontend:${STAMP}" >/dev/null 2>&1; then
  docker tag "ceylon-crm-frontend:${STAMP}" ceylon-crm-frontend:latest
fi
docker compose -f docker-compose.prod.yml up -d
echo "Rolled back to ${STAMP}"
EOF
chmod +x "${REL}/rollback.sh"

ln -sfn "${REL}" "${RELEASES_DIR}/previous"
echo "${STAMP}" > "${RELEASES_DIR}/PREVIOUS"

echo "==> Extracting new release (keeping .env)"
cp .env /tmp/ceylon-crm.env.bak
tar -xzf "${TARBALL}"
mv /tmp/ceylon-crm.env.bak .env

echo "==> Building and restarting containers"
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker image prune -f >/dev/null 2>&1 || true

echo "==> Waiting for backend health"
for i in $(seq 1 40); do
  if curl -sf http://127.0.0.1:5020/health >/dev/null 2>&1; then
    echo "Backend healthy"
    break
  fi
  sleep 3
done

curl -sf http://127.0.0.1:5020/health; echo
curl -sf -o /dev/null -w "https:%{http_code}\\n" https://csm.ceylonautomobile.co.nz/ || true

echo "${STAMP}" > "${RELEASES_DIR}/DEPLOYED_OVER"
echo "==> Previous version saved at ${REL}"
ls -lh "${REL}"
echo "==> Release history"
ls -1 "${RELEASES_DIR}"
