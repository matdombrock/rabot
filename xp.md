# XP / Leveling System — Research

## How Popular Discord Bots Handle XP

### The `discord-xp` Library (Most Popular npm Package)

**Level formula (proven and used by many bots):**
```
level = Math.floor(0.1 * Math.sqrt(xp))
xp = level * level * 100
```

**XP required per level:**
| Level | Total XP needed |
|-------|-----------------|
| 1     | 100             |
| 2     | 400             |
| 5     | 2,500           |
| 10    | 10,000          |
| 20    | 40,000          |

**Progress helper fields (for rank cards / progress bars):**
```js
cleanXp = user.xp - xpFor(user.level)                      // XP into current level
cleanNextLevelXp = xpFor(user.level + 1) - xpFor(user.level)  // XP needed for next level
```

### XP Allocation Per Message

- **Random range:** 15–25 XP per message (`Math.floor(Math.random() * 11) + 15`)
- **Cooldown:** 60 seconds between XP-earning messages per user (in-memory `Map<userId, timestamp>`, not persisted)
- **Minimum message length:** usually 5+ characters
- **Exclusions:** bot accounts, DMs, optionally certain channels

### Voice Channel XP

- **Interval-based:** grant XP every 60 seconds to users in voice
- **Minimum time:** 1 minute before earning starts
- **AFK exclusion:** users in AFK channels don't earn
- **Self-mute/deafen:** usually excluded
- **Rate:** 5–15 XP per minute

### Database Schema (Common Pattern)

```
levels collection/table:
  userID:       string (snowflake)
  guildID:      string (snowflake)
  xp:           number (total cumulative)
  level:        number (derived from xp, stored for fast reads)
  lastUpdated:  Date

rewards table:
  guildID:      string
  rewards:      [{ level: number, roleId: string }]
```

### Cooldown Implementation (In-Memory)

```js
const xpCooldowns = new Map(); // key: `${guildId}-${userId}`, value: expiration timestamp

// In messageCreate handler:
const key = `${message.guild.id}-${message.author.id}`;
if (xpCooldowns.has(key) && Date.now() < xpCooldowns.get(key)) return;
xpCooldowns.set(key, Date.now() + 60000);
```

### Leaderboard Query

```sql
SELECT * FROM levels WHERE guildID = ? ORDER BY xp DESC LIMIT ?;
```

Then resolve usernames from Discord client cache, assign positions.

### Role Rewards

- Stored as `[{ level, roleId }]` per guild
- On level-up, check if any reward matches the new level and assign the role
- Configurable via web panel / slash commands

### Known Bot Behaviors

- **MEE6:** 15–25 XP/message, 60s cooldown, max ~1440 XP/day
- **Carl-bot:** similar cooldown, configurable per-channel multipliers, voice XP (5 XP/min), role rewards
- **Dyno:** similar patterns with customizable XP rates via dashboard

### Relevance to dbot

| Aspect | Recommendation |
|---|---|
| **Database** | dbot already has per-guild SQLite — perfect fit for a `levels` table |
| **Cooldown** | In-memory `Map` (no persistence needed) |
| **XP formula** | `level² × 100` — proven and simple |
| **Voice XP** | Needs `voiceStateUpdate` + interval timer (future) |
| **Leaderboard** | SQLite `ORDER BY xp DESC LIMIT ?` — straightforward |
| **Role rewards** | New table or extended `config` table |
| **Rank cards** | Beyond current scope (requires canvas/image lib) |

### Design Principles (Follow Existing AGENTS.md Rules)

- No one-time migration code paths — document schema changes and move on
- New tables per-guild in `data.db`
- Web panel gets new card components for leaderboard, rank, rewards
