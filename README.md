# dbot

A Discord bot built with discord.js, TypeScript, and Svelte, with a web control panel.

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
| `GUILD_ID` | No | Server ID for instant guild command registration |
| `PORT` | No | Web panel port (default: `3000`) |

### Required Intents

Enable these in the Developer Portal under **Bot > Privileged Gateway Intents**:

- **Server Members Intent** — required for member data in reports
- **Message Content Intent** — required for image checksum matching and post stats

## Usage

```bash
npm run start       # Start bot + web panel
npm run deploy      # Register slash commands with Discord
npm run build       # Compile TypeScript + build frontend
npm run build:frontend  # Frontend only (Svelte → static files)
npm run typecheck
```

`npm run start` boots the Discord bot and starts the web control panel at `http://localhost:3000`.

## Slash Commands

| Command | Permission | Description |
|---|---|---|
| `/ping` | Everyone | Pong! |
| `/info` | Everyone | Bot info (Node.js version, uptime) |

## Web Control Panel

The panel is a Svelte app built with Vite. Run `npm run build:frontend` after any changes. The build output goes to `src/web/public/` and is served by the Express backend.

### Panels

| Panel | Description |
|---|---|
| **Bot Status** | Bot tag, Node version, uptime, WS latency, and a Ping button |
| **Say** | Send messages to a channel. Keeps a history of sent messages with delete-from-server functionality |
| **Image Filter** | Manage SHA256 checksum watchlist. Images posted in any channel are compared against the list — matched images trigger a ban/kick and purge all user messages. Action can be set per-guild. A log of all moderation actions is shown |
| **Quick Report** | Live member list (Username, Display Name, Top Role, Days in Server). Data cached for 40s to avoid rate limits. Supports fuzzy search across all columns and sortable headers |
| **Full Report** | Detailed member report with message stats (Total Posts, Last Post). Sampled from the last 100 messages per text channel. Saved to report history |
| **Recent Reports** | Browse, download, and delete previously generated full reports |

### Image Filter Details

- SHA256 checksums are computed by streaming the image from Discord's CDN — no temporary files
- On match: user is banned or kicked (configurable), and all their messages are deleted across every text channel
- Every action is logged with timestamp, user info, matched checksum/label, channel, and message count

## Database

Data is stored in three separate LowDB files, split by feature so writing to one doesn't serialize the others:

| File | Contents |
|---|---|
| `main.db` | Guild settings, say message history |
| `reports.db` | Full report records (with CSVs) |
| `imagecheck.db` | Checksum watchlist, ban/kick action, moderation logs |

Each is a named export from `src/db.ts` — always use `import { mainDb } from "../db.js"` (never default imports).

## Project Structure

```
src/                        # Backend (TypeScript + Express)
├── index.ts                # Entry point, client + events + web server
├── config.ts               # Env var loading
├── db.ts                   # LowDB schema and singleton
├── types.ts                # Command and Event interfaces
├── deploy-commands.ts      # Registers slash commands
├── commands/               # Slash command modules
│   ├── ping.ts
│   └── info.ts
├── events/
│   ├── ready.ts            # Logs bot tag on ready
│   ├── interactionCreate.ts # Routes slash commands
│   └── messageCreate.ts    # Image checksum matching + ban/kick
├── checksum/
│   └── compute.ts          # Streaming SHA256 from Discord CDN
├── helpers/
│   └── deleteMessages.ts   # Purge all messages from a user
├── reports/
│   ├── quick-report.ts     # Live member cache (40s TTL)
│   └── user-report.ts      # Full report with message stats
└── web/
    ├── server.ts           # Express API + static file server
    └── public/             # Built frontend (auto-generated)

frontend/                   # Frontend (Svelte + Vite)
├── vite.config.js          # Builds to ../src/web/public
├── index.html
└── src/
    ├── main.js             # Entry point
    ├── app.css             # Global styles + CSS custom properties
    ├── App.svelte          # Main layout with all panels
    └── lib/
        ├── Card.svelte         # Collapsible card wrapper
        ├── BotStatus.svelte
        ├── Say.svelte
        ├── ImageFilter.svelte
        ├── ReportPanel.svelte  # Shared report logic (quick + full)
        ├── QuickReport.svelte
        ├── FullReport.svelte
        └── RecentReports.svelte
```

## Frontend Development

The frontend is a standalone Svelte project. For development with hot-reload:

```bash
cd frontend
npm run dev
```

The dev server runs on a different port; API calls are proxied to the Express backend. When ready, build with `npm run build:frontend` (or `npm run build` from root).

### Theming

The color scheme is defined in `frontend/src/app.css` using CSS custom properties:

- `--background`, `--surface`, `--surface-alt`, `--primary`, `--text`, `--text-muted`, `--danger`

## Adding Slash Commands

1. Create a new file in `src/commands/`
2. Export a `Command` object (see existing commands for examples)
3. Import it in `src/commands/index.ts`
4. Run `npm run deploy` to register with Discord
