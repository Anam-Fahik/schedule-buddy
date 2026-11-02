# Presence

A local-only class attendance tracker. Build your timetable, mark each session as attended, missed, or cancelled, and keep the whole thing in your browser.

No accounts, no backend, no API keys, no data leaves the device.

## Features

- Weekly or rotating-cycle schedules
- Add classes manually with room and teacher details
- Per-day attendance: attended, missed, cancelled
- Mark-all present/absent shortcuts
- Day navigation with a daily attendance percentage
- Light/dark mode
- Data survives refreshes via `localStorage`

## Data and privacy

Everything is stored under the `presence.data.v1` key in the browser's
`localStorage`. That means:

- Data is per-browser and per-device.
- There is no sync between devices.
- Clearing site data, using a different browser, or using private browsing
  will not carry your data over.
- Multiple people on the same browser profile share the same data.

## Getting started

Requires a recent Node.js LTS (22+) and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

## Scripts

| Command           | What it does                 |
| ----------------- | ---------------------------- |
| `npm run dev`     | Start the development server |
| `npm run build`   | Build for production         |
| `npm run preview` | Preview the production build |
| `npm run lint`    | Run ESLint                   |
| `npm run format`  | Format with Prettier         |

No environment variables are required.

## Deployment

`npm run build` writes a Nitro build to `.output/`. The default Nitro preset is
Cloudflare Workers; set `NITRO_PRESET` for a different host. Deploy the
generated output with `npx nitro deploy --prebuilt` or your host's Git
integration.

Because this app has no server-side data, a static/SPA export is also possible
if you configure one; the default build still includes a small SSR entry.

## Pushing to GitHub

```bash
git add .
git commit -m "Local-only attendance tracker"
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

## Tech stack

- TanStack Start, TanStack Router, TanStack Query
- React 19
- Tailwind CSS 4
- Framer Motion
- Sonner
- Local storage data layer (`src/lib/local-store.ts`)
