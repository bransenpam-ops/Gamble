# Payment Tracker — Deployment & Admin Guide

This repository runs the Payment Tracker web app (Express + static frontend).

## What I added

- `public/admin.html` — admin UI to view users and edit balances (requires `AUTH_TOKEN`).
- `.env.example` — example environment variables (do NOT commit real secrets).
- `.gitignore` — ignores `node_modules`, `.env`, and backups.
- `render.yaml` — sample Render service configuration.
- Backup routine in `server.js` to periodically save `users.json` to `backups/`.
- Client `API_URL` is set to a relative path so it works when deployed behind a host.

---

## Quick local run (development)

1. Install dependencies:

```bash
npm install
```

2. Create a local `.env` file from the example and set a secure `AUTH_TOKEN`:

```bash
cp .env.example .env
# Edit .env and set AUTH_TOKEN to a long random value
```

Generate a secure token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. Start the app:

```bash
npm start
```

4. Open `http://localhost:3000` and admin UI at `http://localhost:3000/admin.html`.
Paste the `AUTH_TOKEN` into the admin token field to use admin features.

---

## Publish to GitHub (recommended)

1. If you don't have a repo, create one on GitHub (or use the `gh` CLI):

```bash
# Initialize repo (if necessary)
git init
git add .
git commit -m "Prepare app for Render"
# Create remote via GitHub CLI (interactive)
gh repo create your-username/payment-tracker --public --source=. --remote=origin --push
```

2. Alternatively, create repository on github.com and push:

```bash
git remote add origin https://github.com/your-username/payment-tracker.git
git branch -M main
git push -u origin main
```

Notes: do NOT commit your `.env` file or secrets.

---

## Deploy to Render (very simple)

1. Push your code to GitHub and log into https://dashboard.render.com.
2. Click **New** → **Web Service**, connect to your GitHub repo and branch.
3. Set:
   - Environment: `Node`
   - Start Command: `npm start`
4. Add environment variables in Render (Dashboard → Environment):
   - `AUTH_TOKEN` = (the token you generated)
   - Optional: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, etc.
5. Create service and wait for Render to finish deploying. Render will provide HTTPS automatically.
6. Open `https://<your-service>.onrender.com/admin.html` and paste the admin token.

---

## Security checklist (must before public)

- Set a long `AUTH_TOKEN` in Render's Environment Variables and never commit it.
- Use Render's TLS (automatic) or enable HTTPS.
- Consider adding `express-rate-limit` to limit abusive calls.
- Use a process manager or rely on Render's process management.
- Backup `users.json` and monitor `backups/` (already enabled).

---

## Optional: Add rate-limiting (recommended)

You can add `express-rate-limit` to `server.js` and configure conservative limits on sensitive endpoints (login, admin routes).

---

## Next steps I can take for you

- Generate a secure token and create a local `.env` (I will not commit it).
- Add `express-rate-limit` and update `package.json`.
- Attempt to create the GitHub repo and push (requires your GitHub auth via `gh` CLI or credentials).

Tell me which of those you want me to do next.
