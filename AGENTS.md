# dbot

A Discord bot with a Svelte web control panel. Moderates images via SHA256 checksum matching, generates user reports, and provides a web panel for management.

## Tech Stack

- **Runtime:** Node.js 26, TypeScript 7, ESM
- **Backend:** Express 5, discord.js 14, LowDB 7 (JSON file DB)
- **Frontend:** Svelte 5, Vite 8 (builds to `src/web/public/`)
- **Dev:** tsx (runtime), tsc (typecheck)

## Commands

| Command | Description |
|---|---|
| `npm run start` | Start bot + web panel |
| `npm run deploy` | Register slash commands |
| `npm run build` | tsc + build frontend |
| `npm run build:frontend` | Build frontend only |
| `npm run typecheck` | tsc --noEmit |

## DB Layout

Each feature/pane that needs persistence gets its own LowDB file in `db/`. This keeps writes isolated — a bulky report save doesn't serialize say history, and vice versa.

| File | Contents |
|---|---|
| `db/main.json` | Global settings |
| `db/say.json` | Say message history |
| `db/reports.json` | Full report records (with CSVs) |
| `db/imagecheck.json` | Checksums, action, modlogs |

Each is a named export from `src/db.ts`. Always `read()` before access and `write()` after mutation.

### Adding a new feature db

1. Add an interface in `db.ts` for the data shape
2. Create a new `JSONFile` + `Low` instance with a descriptive filename
3. Export it as a named export (e.g. `export const myFeatureDb = new Low<MyFeatureData>(...)`)
4. Add the db file to the layout table above
5. Import the named export wherever it's needed — never use default imports

## Always

- Run `npm run typecheck` before every commit
- Run `npm run build:frontend` after any change to `frontend/src/`
- Rebuild + restart the bot to test changes
- Use named exports from `src/db.ts` — never default imports
- Add new db files to the layout table above when creating a new feature
- Add new config, environment variables, or design decisions to this file

## Never

- **Never add one-time migration code paths.** If the schema changes, document the breaking change and move on. Do not write code that checks for old schemas, fills in missing defaults, or migrates data on read.
- **Never use default imports from `src/db.ts`** — only named exports
- **Never hardcode colors in components** — use CSS custom properties from `frontend/src/app.css`
- **Never commit `.env`, `db/`, or `node_modules/`** — they are in `.gitignore`

## Project Structure

```
src/
├── index.ts              # Entry point
├── db.ts                 # 4 LowDB instances (named exports)
├── config.ts             # Env vars
├── commands/             # Slash command modules
├── events/               # Discord event handlers
├── checksum/compute.ts   # SHA256 streaming
├── helpers/              # Shared utilities
├── reports/              # Report generators
└── web/
    ├── server.ts         # Express API
    └── public/           # Built frontend (generated)

frontend/
└── src/
    ├── App.svelte
    ├── app.css           # Theme CSS variables
    └── lib/              # Svelte components
```

## Key Patterns

- **Web panel** is a Svelte SPA — all data fetching happens via `fetch()` to the Express API on the same origin
- **Reports** use `ReportPanel.svelte` with `export let endpoint, autoRun, showSearch`
- **Image checksums** are computed by streaming from Discord's CDN — no temp files
- **Say history and mod logs** are stored in separate db files so writing one doesn't serialize the other
- **CSS theming** is via `var(--primary)`, `var(--surface)`, etc. in `frontend/src/app.css`
- **Each feature gets its own db file** — add a new `JSONFile` + `Low` instance in `src/db.ts` whenever a new pane needs persistence
