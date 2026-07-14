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
| `npm run user -- <cmd>` | User management (see Auth section) |

## DB Layout

Per guild:

```
db/{guildId}/
├── data.db           # SQLite — members, messages, reports, modlogs, saylogs, checksums, config
└── backfill.json     # Progress tracker for the backfill script

db/auth.db            # SQLite — users, user_guilds, sessions
db/main.json          # LowDB — global settings (only LowDB file)
```

Tables in `data.db`:

| Table | Contents | Populated by |
|---|---|---|
| `messages` | Full message history (id, channelId, authorId, content, createdAt, deleted) | Live `messageCreate` + `npm run backfill` |
| `members` | Member profiles (username, displayName, avatar, join dates, roles, watched) | Live `messageCreate` + backfill |
| `reports` | Saved reports, user scans, AI scans, channel summaries, guild scans | On generate |
| `modlogs` | Image filter moderation actions | On ban/kick match |
| `saylogs` | Say message history | On send |
| `checksums` | Watched SHA256 checksums with labels | Via web panel |
| `textfilters` | Text pattern filters (pattern, action, label) | Via web panel |
| `textfilter_logs` | Text filter moderation log | On match |
| `config` | Key/value settings (action: ban/kick, aichat_enabled) | Via web panel |
| `actionlogs` | Manual mod actions + audit log events | On action |
| `ai_chat_log` | AI chat history (Q&A pairs) | On AI chat response |

Tables in `db/auth.db`:

| Table | Contents |
|---|---|
| `users` | User accounts (id, username, password_hash, discord_id, is_superadmin, created_at) |
| `user_guilds` | Guild assignments — which users can access which guilds (user_id, guild_id) |
| `sessions` | Active session tokens (token, user_id, created_at, expires_at) |

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
├── auth.ts               # Auth DB (users, sessions, guild assignments), password hashing, session management
├── cli-users.ts          # CLI user management (create, delete, assign, revoke, superadmin, list, password, init)
├── backfill.ts           # One-time historical message scan
├── config.ts             # Config loader (reads src/config.json)
├── deploy-commands.ts    # Registers slash commands
├── types.ts              # Command and Event interfaces
├── commands/             # Slash command modules (ping, info)
├── events/
│   ├── ready.ts
│   ├── interactionCreate.ts
│   ├── messageCreate.ts           # Live message tracking + image checksum + text filter matching
│   ├── messageCreateAiChat.ts     # AI chat responder (triggered by bot mention)
│   ├── messageDelete.ts           # Log all message deletions to actionlogs
│   └── guildAuditLogEntryCreate.ts # Track moderation actions via audit logs
├── checksum/
│   └── compute.ts        # Streaming SHA256 from Discord CDN
├── helpers/
│   └── deleteMessages.ts # Purge all messages from a user
├── reports/
│   ├── quick-report.ts        # Live member list (40s TTL cache) with member/online counts
│   ├── user-analysis.ts       # Per-user analysis from SQLite
│   ├── ai-scan.ts             # AI user scan with structured output scoring
│   ├── ai-channel-summary.ts  # AI channel summary with caching
│   ├── ai-guild-scan.ts       # AI guild-wide scan for suspicious users
│   ├── ai-chat-prompt.txt     # Prompt for AI chat feature
│   └── prompts/               # LLM prompt text files
└── web/
    ├── server.ts         # Express API + static file server
    ├── auth.ts           # Auth middleware, login/logout routes, user management API
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
        ├── Analytics.svelte         # Server stats with Chart.js charts (8 charts, drag-to-reorder)
        ├── ChannelSummary.svelte    # AI-powered channel summary with caching
        ├── GuildScan.svelte         # AI guild-wide malicious user scan
        ├── AiChat.svelte            # AI chat toggle and history
        ├── ImageDescribe.svelte     # AI image describe toggle per guild
        ├── Settings.svelte          # Dashboard/bot settings (localStorage + DB)
        ├── ModLog.svelte            # Action log for mod actions and audit events
        ├── Messages.svelte          # Per-channel message browser with pagination, filters, search, CSV export, HTML export
        └── Login.svelte             # Login page (username/password form)
```

## Key Patterns

- **Web panel** is a Svelte SPA — all data fetching via `fetch()` to the Express API on the same origin
- **Guild ID** is entered at the top of the page, passed to all panels as a prop. Last used guild ID is persisted to `localStorage` and restored on page load.
- **Card collapse** — the entire `.card-header` is clickable to collapse/expand each panel. Cards support `expanded`, `collapseAll`, and `forceOpen` props.
- **Drag-and-drop reorder** — panes can be reordered via drag handle using SortableJS (works on desktop and mobile). Order persisted to `rb-zero-pane-order` in localStorage. Analytics charts also have SortableJS reorder with a lock/unlock toggle.
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
- **Chart.js** for analytics charts (8 charts: messages/day, new users/day, messages per channel pie, DOW, top posters, activity by hour, deleted vs active, role distribution). Date range selector, timezone display. Lock/unlock toggle for chart reordering.
- **Settings** stored in `rb-zero-settings` in localStorage: `showTips` (toggle pane descriptions), `showQuickSearch`.
- **Avatar popup** — clicking any avatar shows a lightbox with `?size=512` version, copy URL, and save buttons.
- **AI Scan** — user scan with 5 structured scores (risk, nice, weird, spammer, AI/LLM). Auto-loads cached results. Force re-scan button.
- **AI Channel Summary** — auto-loads cached summary on channel select. Force re-summarize button. Shows channel name, message count, fresh/cached badge.
- **AI Guild Scan** — scans all channels for suspicious users. Caching with new-message detection.
- **AI Chat** — toggle to enable/disable. When enabled, mentioning the bot triggers an AI response using recent channel context. Responses prefixed with `**LLM OUTPUT:**`. 30-second timeout. Chat history visible in pane with delete (removes from Discord too). Per-guild prompt editor (max 1024 chars, stored as `aichat_prompt` in config table, "Reset to default" button). When disabled, bot replies with "Hi, I'm rb-zero. Created by Replicat. My 'brain' is currently disabled. Beep boop."
- **AI Image Describe** — toggle to enable/disable per guild (`aiimagedescribe_enabled` in config table). When enabled, any image uploaded to the server triggers an AI vision API call to describe the image. Uses `config.imageDescribe.model` (separate from chat model). Replies with "This image looks like: <description>" followed by the accessibility disclaimer. Limits to 4 images per message, 30s timeout.
- **Config via `src/config.json`** — port, sessionSecret, Discord credentials, OpenRouter API key/model (`chat`, `scan`, `imageDescribe`), AI scan truncation/temperature settings. `.env` no longer used.
- **Database** — stores AI scans, channel summaries, guild scans, and AI chat logs in the `reports` and `ai_chat_log` tables. Old env files removed.

## Auth

- **Authentication** — httpOnly cookie-based sessions. `db/auth.db` stores users, guild assignments, and session tokens. Passwords hashed with `crypto.scrypt` (no new npm dependencies).
- **User management** — CLI only: `npm run user -- create|delete|superadmin|assign|revoke|list|password|init`
- **Superadmins** — can access ALL guilds the bot is in, plus manage users via CLI
- **Regular users** — can only access explicitly assigned guilds. `/api/guilds` returns only their guilds.
- **Guild access** — enforced via `requireAuth` + `requireGuildAccess` middleware on all `/api/guild/:guildId/*` routes
- **Session** — 30-day TTL, stored in `db/auth.db` sessions table, set as httpOnly cookie `session_token`
- **OAuth migration** — `discord_id` column already exists on users table. To add Discord OAuth later, add OAuth routes and swap the login UI; session/middleware code stays identical.
