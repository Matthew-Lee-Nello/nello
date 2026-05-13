#!/bin/bash
# PreToolUse hook on Bash. Blocks the destructive git operations listed below.
# This is the LAST line of defence; the Claude Code permission system is the
# first. We exit 2 on a block which Claude Code surfaces as the matching
# message to the model.

# Fail closed if jq is missing. Previously a missing jq made the next pipeline
# produce an empty COMMAND, the substring loop matched nothing, and the script
# exit-0'd — silently letting every Bash call through. Exit 2 instead so
# Claude Code reports the hook failure and refuses the tool call.
if ! command -v jq >/dev/null 2>&1; then
  echo "BLOCKED: block-dangerous-git.sh requires jq, which was not found on PATH. Install jq and retry." >&2
  exit 2
fi

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Empty / non-string commands → nothing useful to inspect. Refuse rather than
# fall through.
if [ -z "$COMMAND" ] || [ "$COMMAND" = "null" ]; then
  echo "BLOCKED: block-dangerous-git.sh received an empty Bash command payload." >&2
  exit 2
fi

DANGEROUS_PATTERNS=(
  "git push"
  "git reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
  "push --force"
  "reset --hard"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
