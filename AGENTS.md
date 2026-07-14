# rb-zero

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
| `textfilters` | Text pattern filters (pattern, action, label) | Via web panel |
| `textfilter_logs` | Text filter moderation log | On match |
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
│   ├── messageCreate.ts     # Live message tracking + image checksum matching
│   ├── messageDelete.ts     # Log all message deletions to actionlogs
│   └── guildAuditLogEntryCreate.ts # Track moderation actions via audit logs
├── checksum/
│   └── compute.ts        # Streaming SHA256 from Discord CDN
├── helpers/
│   └── deleteMessages.ts # Purge all messages from a user
├── reports/
│   ├── quick-report.ts   # Live member list (40s TTL cache)
│   └── user-analysis.ts  # Per-user analysis from SQLite
└── web/
    ├── server.ts         # Express API + static file server
    └── public/           # Built frontend (generated)

frontend/
└── src/
    ├── main.js
    ├── app.css           # Theme CSS variables + shared responsive utilities (.table-scroll, .row, .add-row, .status, .btn-sm)
    ├── App.svelte        # Guild selector + all panel cards (persists last guild ID in localStorage)
    └── lib/
        ├── Card.svelte           # Collapsible card wrapper (entire header is collapse control)
        ├── BotStatus.svelte      # Bot info + ping
        ├── Say.svelte            # Send messages + history
        ├── ImageFilter.svelte    # Checksum watchlist + mod log
        ├── TextFilter.svelte     # Text pattern filter management + log
        ├── QuickReport.svelte    # User list with sortable columns, filters, member/online counts
        ├── UserAnalysis.svelte   # Per-user scan with details, past scans, and view messages
        ├── UserSearchBox.svelte  # Reusable user autocomplete with avatar
        ├── AvatarPopup.svelte    # Avatar lightbox with copy/save
        ├── Analytics.svelte      # Server stats with Chart.js charts
        ├── Settings.svelte       # Dashboard/bot settings (localStorage + DB)
        ├── ModLog.svelte         # Action log for mod actions and audit events
        ├── RecentReports.svelte  # Saved scan history
        └── Messages.svelte       # Per-channel message browser with pagination, filters, search, CSV export, HTML export
```

## Key Patterns

- **Web panel** is a Svelte SPA — all data fetching via `fetch()` to the Express API on the same origin
- **Guild ID** is entered at the top of the page, passed to all panels as a prop. Last used guild ID is persisted to `localStorage` and restored on page load.
- **Card collapse** — the entire `.card-header` is clickable to collapse/expand each panel. Cards support `expanded`, `collapseAll`, and `forceOpen` props.
- **Drag-and-drop reorder** — panes can be reordered via drag handle. Order persisted to `dbot-pane-order` in localStorage.
- **Responsive** — shared CSS utilities (`.table-scroll`, `.row`, `.add-row`, `.btn-sm`) in `app.css` with mobile breakpoints at 640px. Tables use horizontal scroll. `.add-row` stacks vertically on mobile. Guild info section hides below 700px.
- **Messages CSV export** — exported client-side from the currently loaded message array.
- **Messages HTML export** — standalone HTML file with search, date grouping, and newest/oldest toggle.
- **Image checksums** are computed by streaming from Discord's CDN — no temp files
- **Message stats** are queried from SQLite — `SELECT COUNT(*), MAX(created_at) FROM messages WHERE author_id = ?`
- **Live tracking** via `messageCreate` — one SQLite insert per message + member upsert
- **Message deletion** — deletes from Discord via API, marks as `deleted` in DB, logged to `actionlogs` table. Deleted messages remain visible with a `(deleted)` tag.
- **Action log** — tracks manual deletes, audit log events (kicks, bans, channel changes, automod), and message removal events in the `actionlogs` table.
- **Backfill** uses batched inserts via `db.transaction()` and `INSERT OR IGNORE` for idempotency
- **CSS theming** via `var(--primary)`, `var(--surface)`, etc. in `frontend/src/app.css`. Never hardcode colors in components.
- **Font Awesome** via `@fortawesome/fontawesome-free` — icons used in pane headers and various controls.
- **Chart.js** for analytics charts (messages/day, new users/day) with date range and interval controls.
- **Settings** stored in `dbot-settings` in localStorage: `showTips` (toggle pane descriptions), `showQuickSearch`.
- **Avatar popup** — clicking any avatar shows a lightbox with `?size=512` version, copy URL, and save buttons.
