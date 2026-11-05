# Privileged Intents

Based on Discord's documentation: https://docs.discord.com/developers/gateway/you-might-not-need-a-privileged-intent

## Current Intent Usage

| Intent | Required? | Why |
|---|---|---|
| `Guilds` | No | Base intent, always needed |
| `GuildMembers` | **Yes — privileged** | Needed for `guild.members.fetch()` in the quick report to enumerate all members with their roles, join dates, and display names |
| `GuildMessages` | No | Needed for live `messageCreate` tracking |
| `MessageContent` | **Yes — privileged** | Needed to read message content for image checksum matching, text filter matching, and message history |
| `GuildModeration` | No | Needed for `GuildAuditLogEntryCreate` event to track mod actions |

### Intents we decided NOT to use

| Intent | Considered for | Alternative |
|---|---|---|
| `GuildPresences` | Online member count | `approximate_presence_count` on the Guild object via REST API — available without any privileged intent |

## How to get privileged intents

1. Go to https://discord.com/developers/applications
2. Select your application
3. Go to **Bot** > **Privileged Gateway Intents**
4. Enable **Server Members Intent** (for `GuildMembers`)
5. Enable **Message Content Intent** (for `MessageContent`)

### Verification requirement

Once your bot is in more than 100 servers, you'll need to apply for verification to use privileged intents. For bots in fewer than 100 servers, the intents can be toggled on directly in the Developer Portal.

## Alternatives we considered

### GuildPresences (online count)

We initially added the `GuildPresences` intent to get accurate online member counts. However, Discord's documentation explicitly states that `approximate_presence_count` is available on the Guild object via the REST API without any privileged intent. We use `g.fetch()` to get a fresh guild object which includes this field.

### MessageContent (message reading)

There is no alternative for our use case. We need to read message content in real-time (via `messageCreate`) to:
- Match images against SHA256 checksums
- Match text against pattern filters
- Archive message history in SQLite

The exceptions Discord provides (messages that @mention the bot, replies, DMs) are not sufficient for this functionality. Migrating to slash commands wouldn't help since the moderation features need to scan all messages in a channel, not just ones that interact with the bot.
