# Composio Tool Router - the connection layer (NELLO-side setup)

nello-claw connects every OAuth app (Gmail, Calendar, Drive, Docs, Sheets, Slack, Notion, CRMs - 1000+) through one Composio **Tool Router**. No Google Cloud project per client, no per-app MCP, no per-app playbook. Replaces the old `workspace-mcp` + per-client Google OAuth.

## How it works

- The client's `.mcp.json` has one `composio` HTTP entry pointing at a per-user **Tool Router** URL:
  `{"type":"http","url":"https://backend.composio.dev/tool_router/<trs_id>/mcp","headers":{"x-api-key":"<PROJECT_KEY>"}}`
- Through it the assistant sees ~6 meta-tools, not every app's tools:
  `COMPOSIO_SEARCH_TOOLS` (find a tool across 1000+ apps), `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MULTI_EXECUTE_TOOL` (run it), `COMPOSIO_MANAGE_CONNECTIONS` (connect an app + get an OAuth link). The tool list stays tiny no matter how many apps connect.
- **No-delete is server-enforced, across every app.** The router session is created with the MCP-standard `destructiveHint` tag disabled, so any delete/trash tool is refused at the session layer (`[Session Restriction] ... blocked for this session (disabled tags: destructiveHint)`). Read / send / draft / create are unaffected. This is a hard guarantee, not a prompt rule.
- **Connect is native.** The assistant calls `COMPOSIO_MANAGE_CONNECTIONS` itself to mint a `connect.composio.dev/link/...` URL when the owner says "connect my email". (Composio's standalone `COMPOSIO_INITIATE_CONNECTION` tool calls a deprecated endpoint and fails - the router's manage-connections works.)
- The router URL is **durable** (keeps working once created).

## What an install collects (.env / bundle keys)

Only the key. The router URL is minted automatically.

| key | what | where from |
|---|---|---|
| `COMPOSIO_API_KEY` | project API key (`ak_...`), the only Composio value anyone pastes | Composio project |
| `GOOGLE_USER_EMAIL` | install's unique id, doubles as `COMPOSIO_USER_ID` | the client |
| `COMPOSIO_MCP_URL` | this install's durable Tool Router URL | **auto-minted by bootstrap** from the key |

## Provisioning (automatic)

`bootstrap.js` calls `provisionRouterUrl()` from `template/scripts/composio-provision.mjs` (pure Node fetch, no Python, no SDK) when `COMPOSIO_API_KEY` is set and `COMPOSIO_MCP_URL` is empty. It `POST`s `https://backend.composio.dev/api/v3.1/tool_router/session` with `{user_id, manage_connections:{enable:true}, tags:{disable:["destructiveHint"]}}` and stores the returned URL. So the only Composio thing collected at install is the API key.

Run it standalone (or from the labs.nello.gg wizard to pre-provision) with:
```
COMPOSIO_API_KEY=ak_xxx node template/scripts/composio-provision.mjs <client_email>
```
If the wizard pre-sets `COMPOSIO_MCP_URL`, bootstrap skips the call.

## PRODUCTION CAVEAT - per-client project isolation (hardening TODO)

The single-project model ships the **same** project key to every client machine. That key can act on every `user_id` in the project, so one leaked client machine could reach other clients' connections. Fine for Matt's own install or a single pilot; **not** for real multi-client.

Before multi-client rollout: one Composio **project per client** (each its own key, each provisioned with its own router session). Needs the Composio **org** API key (dashboard -> org settings; the project key returns 401 on `POST /api/v3.1/org/owner/project/new`). Then a leaked client machine only exposes that one client.
