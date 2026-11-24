#!/usr/bin/env bash
# Daily "still alive" notification (cron, 09:00 IST) until the app is live.
set -u
STATE=$(node -e 'try{console.log(require(process.env.HOME+"/autodeploy/status.json").state)}catch{console.log("waiting")}')
[ "$STATE" = "live" ] && exit 0
ATTEMPTS=$(journalctl -u aitutor-retry --no-pager -o cat 2>/dev/null | grep -cE "Attempt [0-9]+:")
SERVICE=$(systemctl is-active aitutor-retry 2>/dev/null)
if [ "$SERVICE" != "active" ] && [ "$STATE" != "failed" ]; then
  bash "$HOME/autodeploy/notify.sh" "AI Tutor: helper stopped" "The retry service is $SERVICE. Ask Claude to check the helper." "warning" 4 "http://140.245.204.250"
else
  bash "$HOME/autodeploy/notify.sh" "AI Tutor: still waiting" "Oracle has no free server yet. $ATTEMPTS tries so far; still trying every ~90 s. Status: $STATE." "hourglass_flowing_sand" 2 "http://140.245.204.250"
fi
