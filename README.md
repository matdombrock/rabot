# dbot

A Discord bot built with discord.js and TypeScript, with a web control panel.

## Setup

```bash
npm install
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

- **Server Members Intent** — required for `/user-report`
- **Message Content Intent** — required for post stats in `/user-report`

## Usage

```bash
npm run start    # Start bot + web panel
npm run deploy   # Register slash commands with Discord
npm run build    # Compile TypeScript
npm run typecheck
```

`npm run start` boots the Discord bot and starts the web control panel at `http://localhost:3000`.

## Commands

| Command | Description |
|---|---|
| `/ping` | Pong! |
| `/info` | Bot info (Node.js version, uptime) |
| `/user-report` | Generates a CSV report of all server members |

### /user-report

Generates a CSV with the following columns:

- ID, Username, Display Name, Top Role
- Days in Server, Account Age (days), Bot
- Total Posts, Last Post

Post stats are sampled from the last 100 messages in each visible text channel.

## Web Control Panel

The control panel runs alongside the bot at `http://localhost:3000`. It can:

- List all guilds the bot is in
- Generate the user report for any guild
- Render the CSV as an HTML table
- Download the CSV with a timestamped filename

## Project Structure

```
src/
├── index.ts                    # Entry point, loads client + events + web server
├── config.ts                   # Env var loading
├── types.ts                    # Command and Event interfaces
├── deploy-commands.ts          # Registers slash commands with Discord API
├── commands/
│   ├── ping.ts
│   ├── info.ts
│   └── user-report.ts
├── events/
│   ├── ready.ts
│   └── interactionCreate.ts
├── reports/
│   └── user-report.ts          # Shared report generation logic
└── web/
    ├── server.ts               # Express API + static file server
    └── public/
        └── index.html          # Control panel UI
```

## Adding Commands

1. Create a new file in `src/commands/`
2. Export a `Command` object (see existing commands for examples)
3. Import it in `src/index.ts` and `src/deploy-commands.ts`
4. Run `npm run deploy` to register with Discord
