# Coffer — setup guide

A private, shared opportunity tracker for Imran and Elijah.

## 1. Create Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free tier is enough for this small app).
2. In **SQL Editor**, run the complete `supabase/schema.sql` file.
3. In **Project Settings → API → Data API settings**, confirm `public` is included in **Exposed schemas**. New Supabase projects may not expose new tables automatically; this project’s SQL includes minimal grants, and RLS still limits all rows to the two members.
4. In **Authentication → Users → Add user**, create these two users:
   - `ogungbayiimran@gmail.com`
   - `oloyedeelijah23@gmail.com`
5. For each user, set a strong password and enable **Auto Confirm User**. You can use a shared password, but use a unique password not reused elsewhere. Since a password was shared in chat, rotate it before relying on the board.
6. In **Project Settings → API**, copy the Project URL and the publishable/anon key. Never use or expose the `service_role` / secret key in Vercel or browser code.

After either allowed user signs in, the app calls `join_bomb_site()` to create their workspace membership. Other emails are denied.

## 2. Configure locally

```sh
cp .env.example .env.local
```

Set the values in `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Then run:

```sh
npm install
npm run dev
```

Vite prints a local address (usually `http://localhost:5173`).

## 3. Deploy to Vercel

1. Push this project to a private GitHub repository.
2. Import the repository into Vercel. Vercel detects Vite automatically.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Project → Settings → Environment Variables** for Production and Preview.
4. Deploy. Add the Vercel site URL to **Supabase → Authentication → URL Configuration → Site URL** (and Redirect URLs if prompted).

The database is protected by RLS. Only the two hardcoded emails can join; never put a Supabase secret/service-role key in `.env.local` or Vercel's `VITE_` variables.

## 4. Connect your AI assistant (MCP)

Coffer ships a local MCP server so OpenCode can read and update the board as you. It signs in with **your own** Supabase account, so row-level security applies exactly as it does in the browser. There is no shared or service-role key.

Each person does this on their own machine:

1. Install dependencies once: `npm install`.
2. Run the login helper and enter your own Coffer email and password:

   ```sh
   npm run mcp:login
   ```

   It verifies the sign-in, confirms your membership, and writes `.env.mcp.local` (git-ignored, `chmod 600`) with `COFFER_EMAIL` and `COFFER_PASSWORD`. Your password is stored in that file only; delete the file to revoke access.

3. Register the server with OpenCode:

   ```sh
   opencode mcp add coffer -- node "$PWD/mcp/server.mjs"
   ```

4. Start OpenCode and run `/mcps` to confirm `coffer` is connected. Ask it "who am I in Coffer?" to verify the identity.

### What the assistant can do

| Tool | Purpose |
| --- | --- |
| `whoami` | Show which member the connection is signed in as. |
| `list_opportunities` | Search the shared board, with your progress and your teammate's. |
| `get_opportunity` | Full detail: fields, both trackers, comments, recent activity. |
| `add_opportunity` | Add an opportunity; both people get a fresh tracker. |
| `update_opportunity` | Edit shared fields (title, deadline, link, notes, …). |
| `update_my_progress` | Move **your own** status, priority, or applied date. |
| `add_comment` | Leave a shared comment. |
| `list_activity` | Read the recent history. |

Guardrails baked into the server:

- It only ever writes your own tracker; the other person's progress is read-only.
- A response is terminal. `update_my_progress` refuses once your tracker is locked, requires an outcome, and requires a reason for a rejection.
- It never invents ids: read first with `list_opportunities`.

Self-check without OpenCode:

```sh
node mcp/smoke.mjs
```

If it prints `Coffer MCP has no signed-in person`, run `npm run mcp:login` again.

> Note: `.env.mcp.local` is separate from `.env.local`. The web app needs only the URL and publishable key; the MCP server additionally needs your credentials.

## Board behavior

- Each shared opportunity gets a separate tracker for Imran and Elijah.
- You see only your own board, and every card shows both people's progress. There is no member switcher.
- Moving to **Response** opens a confirmation form. The outcome is required; rejection requires a reason. Confirmed responses are locked in the database.
- **Not interested / not eligible** is the combined bin. You can move an item back out of it.
- The custom card body and detail drawer are app-owned. SVAR provides the kanban board and drag/drop only; its built-in card editor is not mounted.
- Comments are shared. Essays are not enabled in this first pass.

## Notes

- The password is never stored in the repo or client-side configuration. Supabase Auth handles passwords.
- Treat the emails as public identifiers, not secrets. Database access still requires a valid Supabase session and membership.
