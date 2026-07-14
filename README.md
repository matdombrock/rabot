# dbot

A Discord bot with a Svelte web control panel. Moderates images via SHA256 checksum matching, generates user analysis, and provides a web panel for management.

## Setup

```bash
npm install
cd frontend && npm install && cd ..
cp .env.example .env
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot token from the Discord Developer Portal |
| `CLIENT_ID` | Yes | Application/client ID from the Developer Portal |
| `GUILD_ID` | No | Server ID for targeted backfill |
| `PORT` | No | Web panel port (default: `3000`) |

### Required Intents

Enable these in the Developer Portal under **Bot > Privileged Gateway Intents**:

- **Server Members Intent** — required for member data in reports
- **Message Content Intent** — required for image checksum matching and message history

## Usage

```bash
npm run start       # Start bot + web panel
npm run deploy      # Register slash commands with Discord
npm run backfill    # One-time scan to populate message history
npm run build       # Compile TypeScript + build frontend
npm run build:frontend  # Frontend only (Svelte → static files)
npm run typecheck
```

`npm run start` boots the Discord bot and starts the web control panel at `http://localhost:3000`. Enter a guild ID at the top to start exploring.

## Slash Commands

| Command | Permission | Description |
|---|---|---|
| `/ping` | Everyone | Pong! |
| `/info` | Everyone | Bot info (Node.js version, uptime) |

## Web Control Panel

The panel is a Svelte app built with Vite. Run `npm run build:frontend` after any changes. The build output goes to `src/web/public/` and is served by the Express backend.

Enter a guild ID at the top to scope all panels to that server.

### Panels

| Panel | Description |
|---|---|
| **Bot Status** | Bot tag, Node version, uptime, WS latency, and a Ping button |
| **User List** | All guild members with avatars, display names, roles, and days in server. Supports fuzzy search and sortable columns. Click **Analyze** on any user |
| **Say** | Send messages to a channel. Keeps a history of sent messages with delete-from-server functionality |
| **Image Filter** | Manage SHA256 checksum watchlist. Images posted in any channel are compared against the list — matched images trigger a ban/kick and purge all user messages. A log of all moderation actions is shown |
| **Text Filter** | Manage text pattern filters. Messages matching a pattern trigger warn/kick/ban. Includes a log of all matched actions |
| **Full Report** | Detailed member report with message stats (Total Posts, Last Post) from SQLite. Saved to report history |
| **Recent Reports** | Browse, download, and delete previously generated full reports and user analyses |
| **Messages** | Browse per-channel message history from the SQLite archive with pagination |

### User Analysis

Click **Analyze** on any user in the User List to open the analysis panel. Shows:

- Username, Display Name, User ID
- Discord join date and guild join date
- Days in server and account age
- Top role and role list
- Boosting status and bot flag
- Total messages and last post date (from SQLite, no channel scanning)

Every analysis is saved to the reports database and accessible via the past analyses list in the card.

### Image Filter Details

- SHA256 checksums are computed by streaming the image from Discord's CDN — no temporary files
- On match: user is banned or kicked (configurable), and all their messages are deleted across every text channel
- Every action is logged with timestamp, user info, matched checksum/label, channel, and message count

## Database

Two storage layers:

**`db/main.json`** (LowDB) — global configuration only. Single JSON file.

**`db/{guildId}/data.db`** (SQLite) — per-guild database with tables:

| Table | Contents | Populated by |
|---|---|---|
| `messages` | Full message history | Live `messageCreate` + `npm run backfill` |
| `members` | Member profiles | Live `messageCreate` + backfill |
| `reports` | Saved reports and user analyses | On generate |
| `modlogs` | Image filter moderation actions | On ban/kick match |
| `saylogs` | Say message history | On send |
| `checksums` | Watched SHA256 checksums with labels | Via web panel |
| `textfilters` | Text pattern filters (pattern, action, label) | Via web panel |
| `textfilter_logs` | Text filter moderation log | On match |
| `config` | Key/value settings (action: ban/kick) | Via web panel |

Run `npm run backfill` once to scan all text channels and populate the message history. Set `GUILD_ID` in `.env` to target a single guild.

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
        ├── Card.svelte           # Collapsible card wrapper (entire header is collapse control)
        ├── BotStatus.svelte      # Bot info + ping
        ├── Say.svelte            # Send messages + history
        ├── ImageFilter.svelte    # Checksum watchlist + mod log
        ├── TextFilter.svelte     # Text pattern filter management + log
        ├── QuickReport.svelte    # User list + analyze + collapsible analysis section + past analyses
        ├── ReportPanel.svelte    # Shared report rendering (full report)
        ├── FullReport.svelte     # Full member report with stats
        ├── RecentReports.svelte  # Saved report history
        └── Messages.svelte       # Per-channel message browser with pagination, filters, search, CSV export
```

## Frontend Development

```bash
cd frontend
npm run dev
```

The dev server runs on a different port; API calls are proxied to the Express backend. When ready, build with `npm run build:frontend`.

### Theming

The color scheme is defined in `frontend/src/app.css` using CSS custom properties:

- `--background`, `--surface`, `--surface-alt`, `--primary`, `--text`, `--text-muted`, `--danger`

### Responsive Design

Shared CSS utilities in `app.css` handle responsive layout:

- `.table-scroll` — wraps tables in a horizontally scrollable container with `-webkit-overflow-scrolling: touch`
- `.row` — flex container with wrap, used for toolbar rows
- `.add-row` — flex container that stacks vertically on screens ≤640px
- Mobile breakpoints at 640px reduce padding, font sizes, and adjust layouts across all panels

### Card Collapse

Every panel card can be collapsed by clicking its header. The User Analysis section inside the User List card has its own independent collapse state, separate from the parent card.

### State Persistence

The last used guild ID is saved to `localStorage` under the key `dbot-last-guild-id` and restored on page load. No other state is persisted.

## Adding Slash Commands

1. Create a new file in `src/commands/`
2. Export a `Command` object (see existing commands for examples)
3. Import it in `src/commands/index.ts`
4. Run `npm run deploy` to register with Discord
