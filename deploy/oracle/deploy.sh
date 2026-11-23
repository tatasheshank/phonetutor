#!/usr/bin/env bash
# Build and (re)start the app on the server. Run after every upload:
#   bash ~/aitutor/deploy/oracle/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # -> ~/aitutor/deploy

missing=0
for f in .env web.env agent.env; do
  if [ ! -f "$f" ]; then
    echo "Missing deploy/$f (copy deploy/$f.example, fill it in, upload again)"
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 1

# shellcheck disable=SC1091
source .env
if [ -z "${DOMAIN:-}" ]; then
  echo "Set DOMAIN in deploy/.env (e.g. 140-238-1-2.sslip.io)"
  exit 1
fi

mkdir -p data
sudo chown -R 1000:1000 data

echo "==> Building and starting (first build takes 5-10 minutes)"
docker compose up -d --build --remove-orphans

echo "==> Cleaning up old images"
docker image prune -f >/dev/null

echo
docker compose ps
echo
echo "Site:      https://$DOMAIN"
echo "Dashboard: https://$DOMAIN/admin"
echo "Logs:      docker compose -f ~/aitutor/deploy/docker-compose.yml logs -f web agent"
echo "(The HTTPS certificate is issued on the first visit; give it a minute.)"
