#!/bin/bash
# Statusline - shown in the Claude Code terminal UI.
# Expects JSON payload on stdin with current session state.

set -u

INSTALL="${NC_INSTALL_PATH:-$HOME/nello-claw}"

# Read stdin payload (model, tokens_used, cache_read, cwd, etc.)
PAYLOAD=$(cat 2>/dev/null || echo '{}')

# Prefer jq for JSON parsing. The old grep/sed extraction broke on escaped
# quotes and nested objects (e.g. when a payload field contained `"model":"x"`
# inside a string). The .js sibling is the canonical statusline; this .sh
# is a fallback for the bash-only path.
if command -v jq >/dev/null 2>&1; then
  MODEL=$(printf '%s' "$PAYLOAD" | jq -r '.model // empty')
  TOKENS=$(printf '%s' "$PAYLOAD" | jq -r '.input_tokens // empty')
  CACHE=$(printf '%s' "$PAYLOAD" | jq -r '.cache_read_input_tokens // empty')
else
  MODEL=$(echo "$PAYLOAD" | grep -oE '"model":\s*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  TOKENS=$(echo "$PAYLOAD" | grep -oE '"input_tokens":\s*[0-9]+' | head -1 | grep -oE '[0-9]+')
  CACHE=$(echo "$PAYLOAD" | grep -oE '"cache_read_input_tokens":\s*[0-9]+' | head -1 | grep -oE '[0-9]+')
fi

MODEL_SHORT="${MODEL:-?}"
case "$MODEL_SHORT" in
  *opus*) MODEL_SHORT="opus" ;;
  *sonnet*) MODEL_SHORT="sonnet" ;;
  *haiku*) MODEL_SHORT="haiku" ;;
esac

# Git branch if in a repo
BRANCH=""
if command -v git >/dev/null 2>&1; then
  BRANCH=$(git -C "${PWD}" rev-parse --abbrev-ref HEAD 2>/dev/null)
  [ -n "$BRANCH" ] && BRANCH="⎇ $BRANCH"
fi

# Token display in k
if [ -n "${TOKENS:-}" ]; then
  TOKEN_DISPLAY="$(awk "BEGIN{printf \"%.1fk\", ${TOKENS}/1000}")"
else
  TOKEN_DISPLAY=""
fi

CACHE_DISPLAY=""
if [ -n "${CACHE:-}" ] && [ "${CACHE:-0}" -gt 0 ]; then
  CACHE_DISPLAY=" ⚡${CACHE}"
fi

echo "⚡ ${MODEL_SHORT} │ ${TOKEN_DISPLAY}${CACHE_DISPLAY} │ ${BRANCH}"
