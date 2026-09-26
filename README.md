# CSF Tracker

A simple website where CSF students log in with their 7-digit school ID and see their progress across all three years:

- **Sophomore**: Trimesters 2–3
- **Junior**: Trimesters 1–3
- **Senior**: Trimesters 1–3

A trimester is **complete** when Dues, Service Hours, and Application are all checked. Students see which items are still missing.

## Board members

Board IDs are asked for the **board code** (`K7`) after entering their ID. Then they see a **Students** tab and a **Settings** tab:

- **Students**: add students (ID, name, Class of…), search, click a name to open their checklist, check off requirements, change their class, or remove them.
- **Settings**:
  - **Class years**: set the current seniors' "Class of" year. Change it at the start of each school year and every student moves up automatically.
  - **Board access**: give or remove board access for any 7-digit ID.

The first board member is `1916869` (set in `SEED_BOARD` in `server.js`, and only used when the database is first created).

## Running it on your computer

Requires Node.js 18+. There are no dependencies to install.

```
npm start
```

Then open http://localhost:3000. Data is saved to `data/db.json`.

## Putting it online for free (Render + Supabase)

The website runs on **Render** (free) and saves its data in **Supabase** (free).

### 1. Set up the database (Supabase)

1. Sign up at [supabase.com](https://supabase.com) and click **New project**. Pick any name and database password, and choose the region closest to you.
2. When it finishes, open **SQL Editor** → **New query**, paste everything from [`supabase-setup.sql`](supabase-setup.sql), and click **Run**.
3. Open **Project Settings** and copy two things:
   - **Project URL** (under **Data API**), which looks like `https://abcd1234.supabase.co`
   - **Secret key** (under **API Keys**), which starts with `sb_secret_`. If you only see older keys, use the **service_role** key.

   Keep the secret key private. Never put it in the code or share it.

### 2. Put the website online (Render)

1. Sign up at [render.com](https://render.com) with your GitHub account.
2. Click **New +** → **Web Service** and pick the `CSF-portal` repo.
3. Settings:
   - **Branch:** the branch with this code
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Under **Environment Variables**, add:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SECRET_KEY` = your secret key
   - `BOARD_CODE` = your board code (optional, default `K7`)
5. Click **Create Web Service**. After a few minutes you get a link like `https://csf-portal.onrender.com`. Share that link with students.

### Good to know about the free plans

- **Render** puts free sites to sleep after about 15 minutes without visitors. The next visitor waits about a minute for it to wake up. Nothing is lost.
- **Supabase** pauses free projects after about a week with no activity (for example, over summer break). Your data is kept. Log in to Supabase and click **Restore project** to turn it back on.
- Any change pushed to the branch on GitHub updates the live site automatically.

To change the board code, set the `BOARD_CODE` environment variable on your host (default `K7`). Codes are not case-sensitive.

> Note: students log in by school ID only. Board access needs a board ID **and** the board code, so share the code only with board members.
