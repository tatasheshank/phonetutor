#!/usr/bin/env bash
# One-time setup of a fresh Oracle Cloud Ubuntu server (Ampere A1 / ARM or x86).
# Run on the server:  bash ~/aitutor/deploy/oracle/setup-server.sh
# Safe to run again.
set -euo pipefail

echo "==> Updating packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "==> Installing Docker (official convenience script)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "==> Opening ports 80 and 443 in the server firewall"
# Oracle's Ubuntu images ship iptables rules that reject everything except SSH.
# (You ALSO need an ingress rule for 80/443 in the VCN security list in the Oracle console.)
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent netfilter-persistent
for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
  # shellcheck disable=SC2086
  if ! sudo iptables -C INPUT -m state --state NEW $rule -j ACCEPT 2>/dev/null; then
    # shellcheck disable=SC2086
    sudo iptables -I INPUT 1 -m state --state NEW $rule -j ACCEPT
  fi
done
sudo netfilter-persistent save

echo "==> Adding 4 GB of swap (headroom while building images)"
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Preparing the data folder (accounts, payments, costs)"
mkdir -p ~/aitutor/deploy/data
# The web container runs as uid 1000 ("node") and must be able to write here.
sudo chown -R 1000:1000 ~/aitutor/deploy/data

echo "==> Daily backup of the data folder (kept 14 days)"
mkdir -p ~/aitutor-backups
CRON="15 3 * * * tar -czf \$HOME/aitutor-backups/data-\$(date +\\%F).tgz -C \$HOME/aitutor/deploy data && find \$HOME/aitutor-backups -name 'data-*.tgz' -mtime +14 -delete"
( crontab -l 2>/dev/null | grep -v aitutor-backups ; echo "$CRON" ) | crontab -

echo
echo "Done. Log out and back in (so the docker group applies), then run:"
echo "  bash ~/aitutor/deploy/oracle/deploy.sh"
