# CSF Tracker

A simple website where CSF students log in with their 7-digit school ID and see their progress across all three years:

- **Year 2**: Trimesters 2–3
- **Year 3**: Trimesters 1–3
- **Year 4**: Trimesters 1–3

A trimester is **complete** when Dues, Service Hours, and Application are all checked. Students see which items are still missing.

## Board members

Board IDs are asked for the **board code** (`K7`) after entering their ID. Then they see a **Students** tab and a **Settings** tab:

- **Students**: add students (ID, name, Class of…), search, click a name to open their checklist, check off requirements, change their class, or remove them.
- **Settings**:
  - **Class years**: set the current seniors' "Class of" year. Change it at the start of each school year and every student moves up automatically.
  - **Board access**: give or remove board access for any 7-digit ID.

The first board member is `1916869` (set in `SEED_BOARD` in `server.js`, and only used when the database is first created).

## Running it

Requires Node.js 18+. There are no dependencies to install.

```
npm start
```

Then open http://localhost:3000. Data is saved to `data/db.json`. Set `PORT` or `DATA_DIR` to change the port or the data folder.

To put it online, deploy to any Node host (Render, Railway, Replit, etc.) using `npm start`. Make sure the `data/` folder is on persistent storage so your data isn't lost on restart.

To change the board code, set the `BOARD_CODE` environment variable on your host (default `K7`). Codes are not case-sensitive.

> Note: students log in by school ID only. Board access needs a board ID **and** the board code, so share the code only with board members.
