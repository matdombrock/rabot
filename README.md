# rb-zero

A Discord bot with a Svelte web control panel. Moderates images via SHA256 checksum matching, generates user analysis, and provides a web panel for management.

## Tech Stack

- **Runtime:** Node.js 26, TypeScript 7, ESM
- **Backend:** Express 5, discord.js 14, better-sqlite3 (per-guild), LowDB 7 (backfill progress only)
- **Frontend:** Svelte 5, Vite 8 (builds to `src/web/public/`)
- **Dev:** tsx (runtime), tsc (typecheck)

## Setup

```bash
npm install
cd frontend && npm install && cd ..
cp src/config.example.json src/config.json
# Edit src/config.json with your Discord token and client ID
```

### Configuration

All configuration is in `src/config.json`. See `src/config.example.json` for the template.

| Field | Required | Description |
|---|---|---|
| `discord.token` | Yes | Bot token from the Discord Developer Portal |
| `discord.clientId` | Yes | Application/client ID from the Developer Portal |
| `discord.guildId` | No | Server ID for targeted commands |
| `port` | No | Web panel port (default: `3000`) |
| `openrouter.apiKey` | No | OpenRouter API key (required for AI features) |
| `openrouter.model` | No | LLM model ID (default: `deepseek/deepseek-v4-flash`) |
| `llmText.truncate` | No | Max chars for message context (default: `8000`) |
| `llmText.maxTokens` | No | Max tokens in AI response (default: `1000`) |
| `llmText.temperature` | No | AI temperature (default: `0.3`) |

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

`npm run start` boots the Discord bot and starts the web control panel at `http://localhost:3000`.

## Authentication & Access Control

The web panel requires login. `db/auth.db` (SQLite) stores users, guild assignments, and session tokens.

### First User

```bash
npm run user -- init
```

Prompts for username/password and creates the first superadmin account.

### CLI User Management

| Command | Description |
|---|---|
| `npm run user -- create <username> <password>` | Create a new user |
| `npm run user -- delete <username>` | Delete a user |
| `npm run user -- password <username> <newPassword>` | Reset password |
| `npm run user -- superadmin <username> [on\|off]` | Toggle superadmin (default: on) |
| `npm run user -- assign <username> <guildId>` | Grant guild access |
| `npm run user -- revoke <username> <guildId>` | Remove guild access |
| `npm run user -- list` | List all users with their guilds |

### Access Model

- **Superadmins** — access every guild the bot is in
- **Regular users** — only see guilds explicitly assigned to them
- Access is enforced via `requireAuth` + `requireGuildAccess` middleware on all `/api/guild/:guildId/*` routes

### Sessions

- httpOnly cookie (`session_token`), 30-day TTL
- `POST /api/auth/login` to authenticate
- `POST /api/auth/logout` to sign out
- `GET /api/auth/me` returns the current user (username, superadmin flag, assigned guilds)

### Web Login

The login page is served at `/`. Superadmins can also manage users through the web UI (in settings).

### No Password Reset Flow

Passwords are reset via CLI only (`npm run user -- password`).

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
| **User Scan** | Search users, view detailed profiles (join dates, roles, message stats, AI scan with 5 scores), manage past scans. Click **Scan** from User List |
| **User List** | All guild members with sortable columns, name/role filters, member/online count, Watch toggle per user, Watch List filter |
| **Say** | Send messages to a channel with send history and delete-from-server |
| **AI Channel Summary** | AI-powered summary of recent channel activity with caching and force re-summarize |
| **AI Guild Scan** | Scan all channels for potentially malicious users with caching |
| **AI Chat** | Toggle to let users chat with AI by mentioning the bot. Chat history with delete |
| **Image Filter** | SHA256 checksum watchlist, ban/kick on match, moderation log |
| **Text Filter** | Text pattern filters with warn/kick/ban actions and action log |
| **Analytics** | 8 charts: messages/day, new users/day, messages per channel pie, DOW, top posters, activity by hour, deleted vs active, role distribution. Date range selector. Drag-to-reorder with lock toggle |
| **Messages** | Browse per-channel message history with search, filters (author, URL, image, @everyone, deleted), CSV/HTML export, per-message delete |
| **Mod Log** | Track manual message deletions and audit log events |
| **Settings** | Dashboard: show tips, show quick search, reset pane order, reset all data. Bot: placeholder |

### User Scan

Click **Scan** on any user in the User List, or use the search box in the User Scan pane. Shows:

- Username, Display Name, User ID
- Discord join date and guild join date
- Days in server and account age
- Top role and role list
- Boosting status and bot flag
- Total messages and last post date (from SQLite)

From the scan results, you can **View Messages** to jump to the Messages pane with the user pre-filtered. The **AI Scan** button runs a structured AI analysis with 5 scores: risk, nice, weird, spammer, AI/LLM (each 1-10). Results are cached — no new API call unless the user has sent new messages since the last scan. Every scan is saved and accessible via the past scans list.

### Image Filter Details

- SHA256 checksums are computed by streaming the image from Discord's CDN — no temporary files
- On match: user is banned or kicked (configurable), and all their messages are deleted across every text channel
- Every action is logged with timestamp, user info, matched checksum/label, channel, and message count

## Database

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
| `config` | Key/value settings (action, aichat_enabled) | Via web panel |
| `ai_chat_log` | AI chat history (Q&A pairs) | On AI chat response |

**`db/{guildId}/backfill.json`** (LowDB) — backfill progress tracking only. Used by `npm run backfill` to resume interrupted scans. Single JSON file per guild.

Run `npm run backfill` once to scan all text channels and populate the message history. Set `GUILD_ID` in `.env` to target a single guild.

## Project Structure

```
src/
├── index.ts              # Entry point, starts client + web server
├── db.ts                 # getGuildDb() — SQLite factory per guild
├── backfill.ts           # One-time historical message scan
├── config.ts             # Env vars
├── deploy-commands.ts    # Registers slash commands
├── types.ts              # Command and Event interfaces
├── commands/             # Slash command modules (ping, info)
├── events/
│   ├── ready.ts
│   ├── interactionCreate.ts
│   ├── messageCreate.ts           # Live message tracking + image checksum + text filter matching
│   ├── messageCreateAiChat.ts     # AI chat responder on bot mention
│   ├── messageDelete.ts           # Log all message deletions to actionlogs
│   └── guildAuditLogEntryCreate.ts # Track moderation actions via audit logs
├── checksum/
│   └── compute.ts        # Streaming SHA256 from Discord CDN
├── helpers/
│   └── deleteMessages.ts # Purge all messages from a user
├── reports/
│   ├── quick-report.ts        # Live member list (40s TTL cache)
│   ├── user-analysis.ts       # Per-user analysis from SQLite
│   ├── ai-scan.ts             # AI user scan with structured output
│   ├── ai-channel-summary.ts  # AI channel summary with caching
│   ├── ai-guild-scan.ts       # AI guild-wide scan
│   └── prompts/               # LLM prompt text files
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
        ├── Analytics.svelte         # Server stats with 8 Chart.js charts, drag-to-reorder
        ├── ChannelSummary.svelte    # AI-powered channel summary with caching
        ├── GuildScan.svelte         # AI guild-wide malicious user scan
        ├── AiChat.svelte            # AI chat toggle and history
        ├── Settings.svelte          # Dashboard/bot settings
        ├── ModLog.svelte            # Action log for mod actions and audit events
        └── Messages.svelte          # Message browser with filters, search, CSV/HTML export, delete
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

Every panel card can be collapsed by clicking its header. Cards support `expanded`, `collapseAll`, and `forceOpen` props.

### Drag-and-Drop Reorder

Panes are reorderable via drag handle using SortableJS (desktop + mobile). Order is persisted to `rb-zero-pane-order` in localStorage. Analytics charts have their own SortableJS reorder with a lock/unlock toggle.

### State Persistence

The following is persisted to `localStorage`:
- `rb-zero-last-guild-id` — last used guild ID
- `rb-zero-pane-order` — drag-and-drop pane ordering
- `rb-zero-pane-state` — collapsed/expanded state per pane
- `rb-zero-settings` — dashboard settings (showTips, showQuickSearch)

### Sticky Header

The header (title, guild selector, guild info) is sticky at the top. On screens wider than 700px, the right side shows guild icon (56px), name, total member count, and online count (from `approximate_presence_count` via REST API — no privileged intent needed). Settings gear icon opens the Settings pane.

### Icons

Pane headers use Font Awesome icons via `@fortawesome/fontawesome-free`.

### Avatar Popup

Clicking any user avatar opens a lightbox with the image at 512px resolution, plus Copy URL and Save buttons.

### AI Features

All AI features use OpenRouter API. API key and model configured in `src/config.json`. Features include:
- **AI Scan** — per-user analysis with 5 structured scores (risk, nice, weird, spammer, AI/LLM). Caches results; force re-scan button.
- **AI Channel Summary** — summarizes recent channel activity. Auto-loads cached result when channel is selected.
- **AI Guild Scan** — scans all channels for suspicious users. Caches based on newest message timestamp.
- **AI Chat** — toggle to enable. Users mention the bot to get AI responses using recent channel context. 30-second timeout. Chat history visible in the pane with Discord message deletion.

## Adding Slash Commands

1. Create a new file in `src/commands/`
2. Export a `Command` object (see existing commands for examples)
3. Import it in `src/commands/index.ts`
4. Run `npm run deploy` to register with Discord
