#!/usr/bin/env bash
# fix-vercel-rootdir.sh - sets the Vercel project's Root Directory to "web" via REST API.
# Use this if the vercel.json approach is not enough (Vercel still tries to build the
# whole monorepo on push). Reads project + team IDs from .vercel/project.json.
#
# Usage:
#   1. Create a Vercel personal access token at https://vercel.com/account/tokens
#      (scope it to the team that owns the nello project)
#   2. export VERCEL_TOKEN=<your token>
#   3. bash scripts/fix-vercel-rootdir.sh
#   4. (optional) trigger a redeploy: git commit --allow-empty -m "redeploy" && git push

set -euo pipefail

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "ERROR: export VERCEL_TOKEN before running this. Get one at https://vercel.com/account/tokens"
  exit 1
fi

if [[ ! -f .vercel/project.json ]]; then
  echo "ERROR: .vercel/project.json not found. Run 'vercel link' from this dir first."
  exit 1
fi

PROJECT_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.vercel/project.json','utf8')).projectId)")
TEAM_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.vercel/project.json','utf8')).orgId)")

echo "Updating project $PROJECT_ID on team $TEAM_ID -> rootDirectory=web, framework=nextjs"

RESP=$(curl -sS -X PATCH "https://api.vercel.com/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "rootDirectory": "web",
    "framework": "nextjs",
    "buildCommand": null,
    "installCommand": null,
    "outputDirectory": null
  }')

if echo "$RESP" | grep -q '"error"'; then
  echo "FAILED:"
  echo "$RESP"
  exit 1
fi

echo "OK. Project settings updated. Trigger a redeploy:"
echo "  git commit --allow-empty -m 'redeploy' && git push origin main"
