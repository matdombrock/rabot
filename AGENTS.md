# dbot

A Discord bot with a Svelte web control panel. Moderates images via SHA256 checksum matching, generates user analysis, and provides a web panel for management.

## Tech Stack

- **Runtime:** Node.js 26, TypeScript 7, ESM
- **Backend:** Express 5, discord.js 14, better-sqlite3 (per-guild), LowDB 7 (global config only)
- **Frontend:** Svelte 5, Vite 8 (builds to `src/web/public/`)
- **Dev:** tsx (runtime), tsc (typecheck)

## Commands

| Command | Description |
|---|---|
| `npm run start` | Start bot + web panel |
| `npm run deploy` | Register slash commands |
| `npm run backfill` | One-time scan to populate message history |
| `npm run build` | tsc + build frontend |
| `npm run build:frontend` | Build frontend only |
| `npm run typecheck` | tsc --noEmit |

## DB Layout

Per guild:

```
db/{guildId}/
├── data.db           # SQLite — members, messages, reports, modlogs, saylogs, checksums, config
└── backfill.json     # Progress tracker for the backfill script

db/main.json          # LowDB — global settings (only LowDB file)
```

Tables in `data.db`:

| Table | Contents | Populated by |
|---|---|---|
| `messages` | Full message history (id, channelId, authorId, content, createdAt) | Live `messageCreate` + `npm run backfill` |
| `members` | Member profiles (username, displayName, avatar, join dates, roles) | Live `messageCreate` + backfill |
| `reports` | Saved reports and user analyses (CSV) | On generate |
| `modlogs` | Image filter moderation actions | On ban/kick match |
| `saylogs` | Say message history | On send |
| `checksums` | Watched SHA256 checksums with labels | Via web panel |
| `config` | Key/value settings (action: ban/kick) | Via web panel |

## Always

- Run `npm run typecheck` before every commit
- Run `npm run build:frontend` after any change to `frontend/src/`
- Rebuild + restart the bot to test changes
- Add new config, environment variables, or design decisions to this file

## Never

- **Never add one-time migration code paths.** If the schema changes, document the breaking change and move on. Do not write code that checks for old schemas, fills in missing defaults, or migrates data on read.
- **Never hardcode colors in components** — use CSS custom properties from `frontend/src/app.css`
- **Never commit `.env`, `db/`, or `node_modules/`** — they are in `.gitignore`

## Project Structure

```
src/
├── index.ts              # Entry point, starts client + web server
├── db.ts                 # mainDb (LowDB) + getGuildDb() (SQLite factory)
├── backfill.ts           # One-time historical message scan
├── config.ts             # Env vars
├── deploy-commands.ts    # Registers slash commands
├── types.ts              # Command and Event interfaces
├── commands/             # Slash command modules (ping, info)
├── events/
│   ├── ready.ts
│   ├── interactionCreate.ts
│   └── messageCreate.ts  # Live message tracking + image checksum matching
├── checksum/
│   └── compute.ts        # Streaming SHA256 from Discord CDN
├── helpers/
│   └── deleteMessages.ts # Purge all messages from a user
├── reports/
│   ├── quick-report.ts   # Live member list (40s TTL cache)
│   ├── user-report.ts    # Full report with SQLite messagestats
│   └── user-analysis.ts  # Per-user analysis from SQLite
└── web/
    ├── server.ts         # Express API + static file server
    └── public/           # Built frontend (generated)

frontend/
└── src/
    ├── main.js
    ├── app.css           # Theme CSS variables
    ├── App.svelte        # Guild selector + all panel cards
    └── lib/
        ├── Card.svelte           # Collapsible card wrapper
        ├── BotStatus.svelte      # Bot info + ping
        ├── Say.svelte            # Send messages + history
        ├── ImageFilter.svelte    # Checksum watchlist + mod log
        ├── QuickReport.svelte    # User list + analyze + analysis history
        ├── ReportPanel.svelte    # Shared report rendering (full report)
        ├── FullReport.svelte     # Full member report with stats
        ├── RecentReports.svelte  # Saved report history
        └── Messages.svelte       # Per-channel message browser
```

## Key Patterns

- **Web panel** is a Svelte SPA — all data fetching via `fetch()` to the Express API on the same origin
- **Guild ID** is entered at the top of the page, passed to all panels as a prop
- **Image checksums** are computed by streaming from Discord's CDN — no temp files
- **Message stats** are queried from SQLite, not stored separately — `SELECT COUNT(*), MAX(created_at) FROM messages WHERE author_id = ?`
- **Live tracking** happens in `messageCreate` — one SQLite insert per message + member upsert
- **Backfill** uses batched inserts via `db.transaction()` and `INSERT OR IGNORE` for idempotency
- **CSS theming** is via `var(--primary)`, `var(--surface)`, etc. in `frontend/src/app.css`
