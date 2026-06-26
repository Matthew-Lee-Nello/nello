#!/bin/bash
# Send a Telegram notification from any shell context.
# Usage: notify.sh "message"

set -e

ENV_FILE="${NC_INSTALL_PATH:-$HOME/nello}/.env"
[ -f "$ENV_FILE" ] || { echo "no .env at $ENV_FILE"; exit 1; }

TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
CHAT_ID=$(grep -E '^ALLOWED_CHAT_ID=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | cut -d, -f1)

[ -z "$TOKEN" ] && { echo "TELEGRAM_BOT_TOKEN missing"; exit 1; }
[ -z "$CHAT_ID" ] && { echo "ALLOWED_CHAT_ID missing"; exit 1; }

MSG="${1:-No message provided}"
# Capture the API response and verify Telegram actually accepted it. A present-but-wrong
# token returns 200 with {"ok":false,...}; the old `-s ... >/dev/null; echo sent` reported
# success on that, so "we sent the update message" was never verified. Fail loudly instead.
RESP=$(curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  --data-urlencode "text=${MSG}")

case "$RESP" in
  *'"ok":true'*) echo "sent" ;;
  *) echo "telegram send failed: ${RESP:-no response}" >&2; exit 1 ;;
esac
