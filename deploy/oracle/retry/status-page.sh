#!/usr/bin/env bash
# Rebuilds the helper's status page (~/status/index.html) from the retry journal and the
# auto-deploy log/status. Run every minute by cron; served on port 80 by aitutor-status.service.
# Shows only progress, IPs and the public link: no keys, passwords or settings.
set -u
OUT_DIR="$HOME/status"
mkdir -p "$OUT_DIR"
esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

STATE="waiting"
URL=""
DETAIL="Asking Oracle for the free server about every 90 seconds."
if [ -f "$HOME/autodeploy/status.json" ]; then
  STATE=$(node -e 'try{console.log(require(process.env.HOME+"/autodeploy/status.json").state||"waiting")}catch{console.log("waiting")}')
  URL=$(node -e 'try{console.log(require(process.env.HOME+"/autodeploy/status.json").url||"")}catch{console.log("")}')
  DETAIL=$(node -e 'try{const s=require(process.env.HOME+"/autodeploy/status.json");console.log(s.error?("Error: "+s.error):("Server "+(s.ip||"")+" · attempt "+(s.attempt||1)))}catch{console.log("")}')
fi
ATTEMPTS=$(journalctl -u aitutor-retry --no-pager -o cat 2>/dev/null | grep -cE "Attempt [0-9]+:")
SERVICE=$(systemctl is-active aitutor-retry 2>/dev/null)
RETRY_LOG=$(journalctl -u aitutor-retry -n 12 --no-pager -o cat 2>/dev/null | esc)
DEPLOY_LOG=$( [ -f "$HOME/autodeploy/log" ] && grep -E "^\[" "$HOME/autodeploy/log" | tail -n 15 | esc || echo "Not started yet." )
NOW=$(TZ=Asia/Kolkata date "+%d %b %Y, %I:%M %p IST")

case "$STATE" in
  live) BADGE="✅ LIVE"; COLOR="#15803d" ;;
  deploying) BADGE="🚀 Deploying"; COLOR="#b45309" ;;
  failed) BADGE="⚠️ Deploy failed (retrying)"; COLOR="#b91c1c" ;;
  *) BADGE="⏳ Waiting for a free Oracle server"; COLOR="#1d4ed8" ;;
esac
LINK=""
[ -n "$URL" ] && LINK="<p class=link><a href=\"$URL\">$URL</a></p>"

cat > "$OUT_DIR/index.html.tmp" <<EOF
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>AI Tutor deploy status</title>
<style>
:root{color-scheme:light dark;--bg:#f7f5f0;--fg:#1c1917;--card:#fff;--muted:#57534e;--b:#d6d3d1}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#fafaf9;--card:#292524;--muted:#d6d3d1;--b:#44403c}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:20px 16px}
.badge{display:inline-block;padding:8px 14px;border-radius:999px;color:#fff;background:$COLOR;font-weight:600;font-size:1.1rem}
.card{background:var(--card);border:1px solid var(--b);border-radius:14px;padding:14px 16px;margin:14px 0}
.muted{color:var(--muted);font-size:.9rem}
.link{font-size:1.2rem;font-weight:600;word-break:break-all}
pre{white-space:pre-wrap;word-break:break-word;font-size:.8rem;margin:0}
h2{font-size:1rem;margin:0 0 8px}
</style></head><body><main>
<h1 style="font-size:1.3rem">AI Tutor: free server &amp; deploy</h1>
<span class="badge">$BADGE</span>
$LINK
<div class="card"><p style="margin:0">$(echo "$DETAIL" | esc)</p>
<p class="muted" style="margin:6px 0 0">Tries so far: <b>$ATTEMPTS</b> · helper service: $SERVICE · updated $NOW · refreshes every minute</p></div>
<div class="card"><h2>Recent tries</h2><pre>$RETRY_LOG</pre></div>
<div class="card"><h2>Deploy steps</h2><pre>$DEPLOY_LOG</pre></div>
</main></body></html>
EOF
mv "$OUT_DIR/index.html.tmp" "$OUT_DIR/index.html"
