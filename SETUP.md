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

## Board behavior

- Each shared opportunity gets a separate tracker for Imran and Elijah.
- The board toggle chooses whose progress the kanban columns show.
- Moving to **Response** opens a confirmation form. The outcome is required; rejection requires a reason. Confirmed responses are locked in the database.
- **Not interested / not eligible** is the combined bin. You can move an item back out of it.
- The custom card body and detail drawer are app-owned. SVAR provides the kanban board and drag/drop only; its built-in card editor is not mounted.
- Comments are shared. Essays are not enabled in this first pass.

## Notes

- The password is never stored in the repo or client-side configuration. Supabase Auth handles passwords.
- Treat the emails as public identifiers, not secrets. Database access still requires a valid Supabase session and membership.
