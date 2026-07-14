# rb-zero

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
| **User Scan** | Search users, view detailed profiles (join dates, roles, message stats), and manage past scans. Click **Scan** from the User List or use the search box |
| **User List** | All guild members with avatars, display names, roles, days in server, member count, and online count. Supports sortable columns, name/role filters. Click **Scan** to open User Scan pane |
| **Say** | Send messages to a channel with send history and delete-from-server |
| **Image Filter** | Manage SHA256 checksum watchlist. Matched images trigger ban/kick and purge all user messages. Log of all actions shown |
| **Text Filter** | Manage text pattern filters with warn/kick/ban actions and action log |
| **Analytics** | Server stats with charts: messages per day, new users per day. Configurable date range and interval |
| **Recent Reports** | Browse, download, and delete saved scans |
| **Messages** | Browse per-channel message history with search, filters (author, URL, image, @everyone, deleted), CSV/HTML export, per-message delete |
| **Mod Log** | Track manual message deletions and audit log events (kicks, bans, channel changes, automod) |
| **Settings** | Configure dashboard: toggle pane tips, quick search, reset pane order, reset all localStorage data |

### User Scan

Click **Scan** on any user in the User List, or use the search box in the User Scan pane. Shows:

- Username, Display Name, User ID
- Discord join date and guild join date
- Days in server and account age
- Top role and role list
- Boosting status and bot flag
- Total messages and last post date (from SQLite)

From the scan results, you can **View Messages** to jump to the Messages pane with the user pre-filtered. Every scan is saved and accessible via the past scans list.

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
| `actionlogs` | Manual mod actions (message deletes) + audit log events | On action |
| `reports` | Saved scans | On generate |
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
│   ├── messageCreate.ts        # Live message tracking + image checksum + text filter matching
│   ├── messageDelete.ts        # Log all message deletions to actionlogs
│   └── guildAuditLogEntryCreate.ts # Track moderation actions via audit logs
├── checksum/
│   └── compute.ts        # Streaming SHA256 from Discord CDN
├── helpers/
│   └── deleteMessages.ts # Purge all messages from a user
├── reports/
│   ├── quick-report.ts   # Live member list (40s TTL cache) with member/online counts
│   └── user-analysis.ts  # Per-user analysis from SQLite
└── web/
    ├── server.ts         # Express API + static file server
    └── public/           # Built frontend (generated)

frontend/
└── src/
    ├── main.js
    ├── app.css           # Theme CSS variables + responsive utilities
    ├── App.svelte        # Root: sticky header, guild bar, drag-and-drop panes
    └── lib/
        ├── Card.svelte           # Collapsible card with icon, description, forceOpen
        ├── BotStatus.svelte      # Bot info + ping
        ├── Say.svelte            # Send messages + history
        ├── ImageFilter.svelte    # Checksum watchlist + mod log
        ├── TextFilter.svelte     # Text pattern filter management + log
        ├── QuickReport.svelte    # User list with sortable columns, name/role filters
        ├── UserAnalysis.svelte   # Per-user scan with details, past scans, view messages
        ├── UserSearchBox.svelte  # Reusable user autocomplete with avatar icon
        ├── AvatarPopup.svelte    # Avatar lightbox with copy/save
        ├── Analytics.svelte      # Server stats with Chart.js charts
        ├── Settings.svelte       # Dashboard/bot settings
        ├── ModLog.svelte         # Action log for mod actions and audit events
        ├── RecentReports.svelte  # Saved scan history
        └── Messages.svelte       # Message browser with filters, search, CSV/HTML export, delete
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

The following is persisted to `localStorage`:
- `dbot-last-guild-id` — last used guild ID
- `dbot-pane-order` — drag-and-drop pane ordering
- `dbot-pane-state` — collapsed/expanded state per pane
- `dbot-settings` — dashboard settings (showTips, showQuickSearch)

### Sticky Header

The header (title, guild selector, guild info) is sticky at the top of the viewport. On screens wider than 700px, the right side shows the guild icon (56px), name, total member count, and online count (from `approximate_presence_count` via REST API — no privileged intent needed).

### Icons

Pane headers use Font Awesome icons. Imported via `@fortawesome/fontawesome-free` in `main.js`.

### Avatar Popup

Clicking any user avatar opens a lightbox with the image at 512px resolution, plus Copy URL and Save buttons.

## Adding Slash Commands

1. Create a new file in `src/commands/`
2. Export a `Command` object (see existing commands for examples)
3. Import it in `src/commands/index.ts`
4. Run `npm run deploy` to register with Discord
