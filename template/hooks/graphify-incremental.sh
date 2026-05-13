#!/bin/bash
# PostToolUse hook - rebuilds the knowledge graph incrementally after vault edits.
# Non-fatal. Skips silently if graphify is not installed. The Node version
# (.js sibling) is the canonical implementation - this .sh exists for the
# bash-only install path.

set -u

INSTALL="${NC_INSTALL_PATH:-$HOME/nello-claw}"
VAULT_PATH=$(grep -E '^VAULT_PATH=' "$INSTALL/.env" 2>/dev/null | cut -d= -f2 | tr -d '"')

# Bail if vault path not set or graphify not available
[ -z "${VAULT_PATH:-}" ] && exit 0
command -v graphify >/dev/null 2>&1 || exit 0

# Parse file_path via jq. Previous regex/sed extraction broke on escaped quotes,
# backslashes, Unicode escapes, or multiple file_path occurrences. If jq isn't
# present we exit 0 (this is a non-blocking post hook), but we don't fall back
# to brittle regex.
command -v jq >/dev/null 2>&1 || exit 0
PAYLOAD=$(cat)
TOUCHED_PATH=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.file_path // empty')
[ -z "$TOUCHED_PATH" ] && exit 0

# Realpath both sides so a `vault-evil/x.md` doesn't pass the prefix check for
# a vault at `vault/`. Tolerate non-existent touched paths by realpath'ing
# whichever ancestor exists.
if command -v python3 >/dev/null 2>&1; then
  TOUCHED_REAL=$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$TOUCHED_PATH" 2>/dev/null || echo "$TOUCHED_PATH")
  VAULT_REAL=$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$VAULT_PATH" 2>/dev/null || echo "$VAULT_PATH")
else
  TOUCHED_REAL="$TOUCHED_PATH"
  VAULT_REAL="$VAULT_PATH"
fi

case "$TOUCHED_REAL" in
  "$VAULT_REAL") ;;
  "$VAULT_REAL"/*) ;;
  *) exit 0 ;;
esac

# Fire-and-forget incremental rebuild
(cd "$VAULT_REAL" && graphify rebuild --incremental >/dev/null 2>&1 &)
exit 0
