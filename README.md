# Coffer

A shared two-person opportunity tracker built with React, Vite, SVAR React Kanban and Supabase.

Start with [`SETUP.md`](./SETUP.md) for Supabase, local development and Vercel deployment steps.

## MCP server

Coffer ships a local [MCP](https://modelcontextprotocol.io) server so an AI assistant (OpenCode here) can read and update the board as **you**. It runs on your own machine over stdio and signs in with your own Supabase account, so row-level security applies exactly as it does in the browser. There is no shared credential and no service-role key.

### 1. Install dependencies

```sh
npm install
```

### 2. Sign in as yourself

```sh
npm run mcp:login
```

Enter your own Coffer email and password. The helper verifies the sign-in and your workspace membership, then writes `.env.mcp.local` (git-ignored, `chmod 600`). Your password lives only in that file — delete it to revoke this machine's access.

The web app's `.env.local` is separate: it needs only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The MCP server additionally needs `COFFER_EMAIL` and `COFFER_PASSWORD`.

### 3. Register the server

```sh
opencode mcp add coffer -- node "$PWD/mcp/server.mjs"
```

This writes the server into your OpenCode config (by default `~/opencode.json`, or the project config with `--global` omitted). Use the absolute path: OpenCode may launch the server from a different working directory.

### 4. Check it

Run `/mcps` in OpenCode and confirm `coffer` is connected, then ask *"who am I in Coffer?"*.

Without OpenCode, the bundled self-check lists the tools and calls `whoami`:

```sh
node mcp/smoke.mjs
```

If it reports `Coffer MCP has no signed-in person`, run `npm run mcp:login` again.

### Tools

| Tool | Purpose |
| --- | --- |
| `whoami` | Show which member the connection is signed in as. |
| `list_opportunities` | Search the board, with your progress and your teammate's. Filter by text, your status, or type. |
| `get_opportunity` | Full detail: fields, both trackers, comments, recent activity. |
| `add_opportunity` | Add an opportunity; both people get a fresh tracker automatically. |
| `update_opportunity` | Edit shared fields (title, organization, type, deadline, link, location, notes). |
| `update_my_progress` | Move **your own** status, priority, or applied date. |
| `add_comment` | Leave a shared comment the other person can see. |
| `list_activity` | Read the shared history: adds, edits, status moves, responses, comments. |

### Guardrails

- The server only ever writes the signed-in member's tracker. The other person's progress is read-only, even though the database permits either member to edit either row.
- A response is terminal: once your tracker moves to `response`, it locks and the server refuses further changes. An outcome is required, and a rejection needs a reason.
- Ids must come from `list_opportunities` — the server never invents one.
- Only the two allowlisted emails can join the workspace; the MCP cannot widen that.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Coffer MCP has no signed-in person` | `npm run mcp:login` |
| `Coffer is not configured` | Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local` |
| `Coffer sign-in failed` | Wrong password, or the account was rotated — rerun `npm run mcp:login` |
| `Could not open the Coffer workspace` | The email is not one of the two allowlisted members |
| Server missing from `/mcps` | Re-run `opencode mcp add` with the absolute path to `mcp/server.mjs` |

Each person runs their own login on their own machine. Never commit `.env.mcp.local` or share its contents.
