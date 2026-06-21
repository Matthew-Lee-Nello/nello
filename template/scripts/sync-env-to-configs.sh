#!/bin/bash
# Regenerate .mcp.json and claude_desktop_config.json from the live .env.
# Run this after editing .env (e.g. rotating a key) to keep the MCP configs in sync.
# Fast + side-effect-free: it does NOT reseed the vault, reinstall plugins/skills/
# services, or touch CLAUDE.md — it only rewrites the two config files.

set -e

# Self-locating: this script lives at <install>/template/scripts/, so the install
# root is two levels up and bootstrap.js is one level up. Resolving from the script
# path (not $HOME/nello-claw) means it works wherever the install actually lives.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$INSTALL"

if [ ! -f "bundle.json" ]; then
  echo "bundle.json missing - re-run the wizard at labs.nello.gg"
  exit 1
fi

NC_INSTALL_PATH="$INSTALL" node "$SCRIPT_DIR/../bootstrap.js" --configs-only
