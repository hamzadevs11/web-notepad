# Web Notepad

Rich-text notepad: paste keeps formatting exactly as copied (Ctrl+Shift+V = plain text), multiple notes, search,
download as .txt/.html, open local files, dark mode, autosave. Works offline in the browser; optional cloud sync
through a serverless backend (Vercel Function + Upstash Redis).

## Deploy
1. Push this folder to a new GitHub repo.
2. vercel.com > Add New > Project > import the repo. Framework: **Other**. No build command. Deploy.
3. Project > Storage (Marketplace) > add **Upstash Redis**, connect it to the project, then **Redeploy**.
   (Env vars `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are added automatically.)
4. Open the site > "Sync: off" > Generate > Save & sync. Use the same key on other devices.

## Notes
- Without step 3 the app still works; notes stay in that browser only.
- Sync key = password for your notes. It is SHA-256 hashed on the server. Conflicts: latest edit wins per note.
- Limits: 500 notes per key, ~500 KB per note.

## Local test
`npm i -g vercel && npm i && vercel dev`
