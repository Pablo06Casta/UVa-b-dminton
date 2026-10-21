#!/usr/bin/env bash
# Instalación del servidor del club en una máquina Ubuntu (Oracle Cloud Always Free u otra).
#   DOMAIN=club-uva.duckdns.org SITE_URL=https://pablo06casta.github.io/UVa-b-dminton bash install.sh
# Opcional: OFFICIAL_READ=false para dejar la lectura de badminton.es desactivada (por defecto, activada).
set -euo pipefail

DOMAIN="${DOMAIN:?Indica DOMAIN (nombre que apunta a la IP de esta máquina)}"
SITE_URL="${SITE_URL:-https://pablo06casta.github.io/UVa-b-dminton}"
OFFICIAL_READ="${OFFICIAL_READ:-true}"
REPO="${REPO:-https://github.com/Pablo06Casta/UVa-b-dminton.git}"
BRANCH="${BRANCH:-claude/peaceful-ride-r3scdt}"
DIR="$HOME/UVa-b-dminton"

echo "==> Memoria de intercambio (la máquina gratuita AMD tiene 1 GB)"
if ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Docker y git"
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sudo sh; fi
sudo apt-get install -y git iptables-persistent >/dev/null
sudo usermod -aG docker "$USER" || true

echo "==> Cortafuegos de la máquina: puertos 80 y 443 (Ubuntu en Oracle los bloquea por defecto)"
for p in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p tcp --dport "$p" -j ACCEPT
done
sudo netfilter-persistent save >/dev/null

echo "==> Código"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" pull -q origin "$BRANCH"; else git clone -q -b "$BRANCH" "$REPO" "$DIR"; fi
cd "$DIR/server"

echo "==> Configuración (.env con ADMIN_TOKEN y claves de avisos nuevas)"
if [ ! -f .env ]; then
  sudo docker run --rm -v "$PWD":/app -w /app node:22-slim sh -c "npm ci --omit=dev >/dev/null 2>&1 && node scripts/setup.mjs --site=$SITE_URL" >/dev/null
  sudo chown "$USER":"$USER" .env
  sed -i "s/^OFFICIAL_READ_ENABLED=.*/OFFICIAL_READ_ENABLED=$OFFICIAL_READ/" .env
  sed -i "s#^CORS_ORIGINS=.*#CORS_ORIGINS=$(echo "$SITE_URL" | sed -E 's#(https?://[^/]+).*#\1#')#" .env
fi

echo "==> Arranque"
cd deploy/oracle
DOMAIN="$DOMAIN" sudo -E docker compose up -d --build

echo
echo "Listo. Comprueba en un minuto:  https://$DOMAIN/api/health"
echo "Token de administración (guárdalo y no lo compartas):  grep ADMIN_TOKEN $DIR/server/.env"
echo "Panel:  https://$DOMAIN/admin"
