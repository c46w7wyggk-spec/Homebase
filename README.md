# Homebase

One installable app for schedule, meals, goals, learning, and running.

- **Front end:** plain HTML, CSS and JavaScript. No build step.
- **Data:** Supabase (Postgres with row-level security). Each user only sees their own rows.
- **Offline:** a service worker caches the app; changes made offline are saved on the device and sync when you reconnect.
- **Calendar:** the Schedule page exports a weekly `.ics`. Events marked "reference" (classes already in your calendar) stay out of it.

## Files
- `index.html`, `style.css`, `app.js`: the app
- `course.js`: lessons for the Learn tab (Deep Daily). Progress is saved as the `learn/progress` item; the morning article is a `context/<date>` item written by a scheduled task
- `config.js`: Supabase URL and publishable key (safe to publish; row-level security protects the data)
- `sw.js`, `manifest.webmanifest`, `icons/`: install and offline support
- `vendor/supabase.js`: pinned copy of supabase-js 2.45.4
- `supabase/migrations/`: database schema

## Run locally
`python3 -m http.server 8000` in this folder, then open http://localhost:8000.

## Deploy
Pushes to `main` publish the site with GitHub Pages (`.github/workflows/pages.yml`). Bump `VERSION` in `sw.js` when you change cached files.

## First sign-in
In Supabase, open Authentication, Users, Add user, enter your email and a password, and tick auto-confirm. Then sign in on the app.
