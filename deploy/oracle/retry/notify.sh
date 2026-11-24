#!/usr/bin/env bash
# Sends a push notification to the owner's phone via ntfy.sh (free, no account).
#   notify.sh "Title" "Message" [tags] [priority 1-5] [click-url]
# The topic is a long random name in ~/autodeploy/ntfy_topic: only someone who knows it can read it.
# Never send secrets through this: ntfy.sh is a public relay.
set -u
TOPIC_FILE="$HOME/autodeploy/ntfy_topic"
[ -f "$TOPIC_FILE" ] || exit 0
TOPIC=$(cat "$TOPIC_FILE")
TITLE="${1:-AI Tutor}"
MSG="${2:-}"
TAGS="${3:-robot}"
PRIO="${4:-3}"
CLICK="${5:-}"
args=(-s -m 20 -H "Title: $TITLE" -H "Tags: $TAGS" -H "Priority: $PRIO")
[ -n "$CLICK" ] && args+=(-H "Click: $CLICK")
curl "${args[@]}" -d "$MSG" "https://ntfy.sh/$TOPIC" >/dev/null 2>&1 || true
