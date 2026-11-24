#!/usr/bin/env bash
# Runs ON THE HELPER right after retry-create.mjs succeeds. Deploys the app to the new
# free A1 server without the laptop: copy app + settings, one-time setup, build, start, verify.
#
# Expects in ~/autodeploy/:
#   app.tgz          the app (same packing as deploy/upload.ps1)
#   web.env agent.env  server settings (deploy/*.env from the laptop)
#   aitutor          SSH private key for the new server (chmod 600)
# and ~/retry/server.json written by retry-create.mjs ({ ip, domain, ... }).
#
# Writes progress to ~/autodeploy/log and the outcome to ~/autodeploy/status.json.
# Safe to run again: each step is idempotent. Gives up after 4 attempts.
set -uo pipefail

DIR="$HOME/autodeploy"
LOG="$DIR/log"
STATUS="$DIR/status.json"
KEY="$DIR/aitutor"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=30)

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"; }
status() { printf '%s\n' "$1" > "$STATUS"; }
notify() { bash "$DIR/notify.sh" "$@"; }

[ -f "$STATUS" ] && grep -q '"state": *"live"' "$STATUS" && { log "Already live, nothing to do."; exit 0; }

ATTEMPTS_FILE="$DIR/attempts"
ATTEMPT=$(( $(cat "$ATTEMPTS_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$ATTEMPT" > "$ATTEMPTS_FILE"
if [ "$ATTEMPT" -gt 4 ]; then
  log "Gave up after 4 attempts. See this log; fix, then: rm $ATTEMPTS_FILE && bash $0"
  notify "AI Tutor: deploy gave up" "4 deploy attempts failed. The server exists but the app isn't running. Ask Claude to check." "rotating_light" 5 "http://140.245.204.250"
  exit 0   # exit 0 so systemd stops restarting
fi

IP=$(node -e 'console.log(require(process.env.HOME + "/retry/server.json").ip)')
DOMAIN=$(node -e 'console.log(require(process.env.HOME + "/retry/server.json").domain)')
TARGET="ubuntu@$IP"
log "Attempt $ATTEMPT: deploying to $TARGET ($DOMAIN)"
status "{\"state\": \"deploying\", \"ip\": \"$IP\", \"domain\": \"$DOMAIN\", \"attempt\": $ATTEMPT}"
if [ "$ATTEMPT" -eq 1 ]; then
  notify "AI Tutor: free server found!" "Oracle created the server ($IP). Deploying the app now (about 15 minutes)." "tada" 4 "http://140.245.204.250"
else
  notify "AI Tutor: deploying again" "Deploy attempt $ATTEMPT of 4 on $IP." "repeat" 3 "http://140.245.204.250"
fi

fail() {
  log "FAILED: $*"
  status "{\"state\": \"failed\", \"ip\": \"$IP\", \"domain\": \"$DOMAIN\", \"attempt\": $ATTEMPT, \"error\": \"$*\"}"
  notify "AI Tutor: deploy attempt $ATTEMPT failed" "$*. Retrying automatically in 2 minutes (max 4 attempts)." "warning" 4 "http://140.245.204.250"
  exit 1   # systemd restarts the service in 2 minutes -> next attempt
}

log "Waiting for SSH on the new server ..."
for i in $(seq 1 40); do
  ssh "${SSH_OPTS[@]}" "$TARGET" true 2>/dev/null && break
  [ "$i" -eq 40 ] && fail "SSH not reachable after 10 minutes"
  sleep 15
done

log "Copying the app and settings ..."
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p ~/aitutor/deploy" || fail "mkdir"
scp "${SSH_OPTS[@]}" -q "$DIR/app.tgz" "$TARGET:~/aitutor-upload.tgz" || fail "copy app"
scp "${SSH_OPTS[@]}" -q "$DIR/web.env" "$DIR/agent.env" "$TARGET:~/aitutor/deploy/" || fail "copy settings"
ssh "${SSH_OPTS[@]}" "$TARGET" "printf 'DOMAIN=%s\n' '$DOMAIN' > ~/aitutor/deploy/.env && chmod 600 ~/aitutor/deploy/*.env ~/aitutor/deploy/.env && tar -xzf ~/aitutor-upload.tgz -C ~/aitutor && rm ~/aitutor-upload.tgz" \
  || fail "unpack"

log "One-time server setup (Docker, firewall, swap, backups) ..."
ssh "${SSH_OPTS[@]}" "$TARGET" "bash ~/aitutor/deploy/oracle/setup-server.sh" >> "$LOG" 2>&1 || fail "setup-server.sh"

# New SSH session so the docker group from setup applies.
log "Building and starting the app (5-15 minutes) ..."
ssh "${SSH_OPTS[@]}" "$TARGET" "bash ~/aitutor/deploy/oracle/deploy.sh" >> "$LOG" 2>&1 || fail "deploy.sh"

log "Checking https://$DOMAIN ..."
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/" || true)
  if [ "$code" = "200" ]; then
    log "LIVE: https://$DOMAIN"
    notify "AI Tutor is LIVE" "Your app now runs 24/7 at https://$DOMAIN (works with the laptop off). Demo login 9000000001 / 123456." "white_check_mark" 5 "https://$DOMAIN"
    status "{\"state\": \"live\", \"ip\": \"$IP\", \"domain\": \"$DOMAIN\", \"url\": \"https://$DOMAIN\", \"liveAt\": \"$(date -u +%FT%TZ)\"}"
    exit 0
  fi
  sleep 20
done
fail "site did not answer 200 over HTTPS within 10 minutes (last HTTP $code)"
