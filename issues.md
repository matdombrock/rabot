# rb-zero Issues Audit

## Critical

C1. **Session cookie missing `Secure` flag** (`src/web/auth.ts:56`) — Session cookie is sent over plain HTTP, allowing network-level session hijacking. Add `; Secure` to the cookie string.

C2. **`sessionSecret` defined but never used** (`src/config.json:3`, `src/auth.ts`) — The config declares `sessionSecret: "change-me-to-a-random-string"` but no code references it. Session tokens are raw UUIDs stored in SQLite with no signing or HMAC. Dead config field that misleads about actual security posture.

C3. **Path traversal via `guildId`** (`src/db.ts:57`) — `getGuildDb()` calls `mkdirSync(db/${guildId})` using raw URL parameter input. A crafted guildId like `../../tmp/evil` creates directories/files at arbitrary paths. Should validate guildId matches a numeric Discord snowflake pattern.

C4. **XSS via `marked` + `{@html}`** (`frontend/src/lib/UserAnalysis.svelte:385`, `ChannelSummary.svelte:150`, `GuildScan.svelte:181`) — AI-generated markdown is rendered as raw HTML via `{@html marked(...)}` with no DOMPurify sanitization. Prompt injection or a compromised API response could execute arbitrary scripts in the panel.

C5. **`checksums` table has no primary key or unique constraint** (`src/db.ts:124-127`) — Every query does a full table scan. Concurrent inserts can create duplicate checksums — the application-level duplicate check at `server.ts:773` is a TOCTOU race. Should be `checksum TEXT PRIMARY KEY`.

C6. **`reports` is a polymorphic table** (`src/db.ts:87-95`) — Stores 5+ report types (user analysis, AI scans, channel summaries, guild scans) in one table with a `type` discriminator. Columns like `risk_score`, `guild_toxicity_score`, `channel_id` are NULL for unrelated types. Requires 19 `ALTER TABLE` migrations to add columns that only apply to specific types. Should be split into separate tables (`ai_scans`, `channel_summaries`, `guild_scans`, `legacy_reports`).

## High

H1. **No brute-force protection on login** (`src/web/auth.ts:48-57`) — No rate limiting, lockout, or exponential backoff. Combined with no password complexity requirements, brute-force is practical.

H2. **Unbounded memory in AI reports** (`src/reports/ai-scan.ts:85`, `ai-channel-summary.ts:84`, `ai-guild-scan.ts:67`) — All three run `SELECT ... ORDER BY created_at DESC` with no `LIMIT`. On active users/channels or large guilds, this loads unbounded data into memory.

H3. **No rate limiting on AI endpoints** (`src/web/server.ts:608,627,643`) — AI scan/summary/guild-scan trigger external API calls with no rate limiting or concurrency control. Spamming these racks up OpenRouter costs.

H4. **SSRF via image describe** (`src/events/messageCreateImageDescribe.ts:38-49`) — URLs from message content are fetched directly. An internal-network URL (e.g., `http://169.254.169.254/`) could be used to probe cloud metadata services.

H5. **No global error handlers** (`src/index.ts:46`) — No `process.on('uncaughtException')` or `unhandledRejection` handlers. The bot can crash silently.

H6. **Uncaught promise rejections in event handlers** (`src/events/messageCreate.ts`, `messageUpdate.ts`, `messageDelete.ts`) — `async` execute functions registered via `client.on()` produce unhandled rejections if any `await` throws. These can crash the process.

H7. **EditHistory interval leak** (`frontend/src/lib/EditHistory.svelte`) — Defines `startRefresh()`/`stopRefresh()` but never calls `onDestroy(stopRefresh)`. Intervals continue running after unmount.

H8. **Duplicate `load()` call in Analytics** (`frontend/src/lib/Analytics.svelte:80,110`) — Two identical reactive statements cause `load()` to fire twice on every guild change.

H9. **CSV injection in user-analysis export** (`src/reports/user-analysis.ts:59-75`) — User-controlled values interpolated without escaping CSV injection prefixes (`=`, `+`, `-`, `@`). `quick-report.ts` has a `csvEscape` helper but `user-analysis.ts` doesn't use it.

H10. **Missing indexes on `reports` for AI cache lookups** (`src/db.ts:87-95`) — `SELECT ... WHERE type = 'ai-scan' AND username = ? ORDER BY generated DESC` and `WHERE type = 'channel-summary' AND channel_id = ? ORDER BY generated DESC` do full table scans. Every AI scan and channel summary checks cache with a full scan. Needs composite indexes on `(type, username, generated DESC)` and `(type, channel_id, generated DESC)`.

H11. **Missing index on `sessions.user_id`** (`src/auth.ts:33-38`) — `DELETE FROM sessions WHERE user_id = ?` scans all sessions. Needs `CREATE INDEX idx_sessions_user ON sessions(user_id)`.

H12. **Missing index on `ai_chat_log`** (`src/db.ts:184-194`) — `SELECT ... WHERE guild_id = ? ORDER BY created_at DESC` does a full table scan every time the AI Chat pane is opened. Needs `CREATE INDEX idx_aichatlog_guild_time ON ai_chat_log(guild_id, created_at DESC)`.

H13. **Non-idempotent INSERT on `messages`** (`src/events/messageCreate.ts:66`) — Uses plain `INSERT` instead of `INSERT OR IGNORE`. Discord gateway retries on duplicate message IDs will throw. Backfill correctly uses `INSERT OR IGNORE`.

## Medium

M1. **No CSRF tokens** — No CSRF protection on any state-changing endpoint. `SameSite=Lax` provides partial mitigation but doesn't cover all vectors.

M2. **No security headers** — No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or `Strict-Transport-Security`.

M3. **Silent schema migration errors** (`src/db.ts:160-180`) — 19 `try { ALTER TABLE } catch {}` blocks swallow all errors. Disk full, corruption, or permission issues are silently lost.

M4. **Password change via CLI deletes and recreates user** (`src/cli-users.ts:125-131`) — Changes password by deleting the user row and recreating it, which invalidates the user's UUID and all foreign key references.

M5. **19 `ALTER TABLE` migrations violate AGENTS.md "Never" rule** (`src/db.ts:160-180`) — The project explicitly forbids migration code paths, yet there are 19 of them. These should be in `CREATE TABLE`.

M6. **AvatarPopup keyboard listener bug** (`frontend/src/lib/AvatarPopup.svelte:31-36`) — `on:keydown` registered once at mount based on initial `show=false`, so Escape never closes the popup.

M7. **No error handling on most frontend `fetch()` calls** — Dozens of fetch calls across components have no try/catch or `r.ok` check. Expired sessions or network errors cause silent failures with no user feedback.

M8. **Missing CHECK constraints on most tables** (`src/db.ts`) — Only `textfilters.action` has a CHECK constraint. Missing: `reports.type`, `modlogs.action`, `textfilter_logs.action`, `members.is_bot`, `members.watched`, `messages.deleted`, `users.is_superadmin` (all should be `IN (0, 1)` for booleans).

M9. **Missing foreign keys on guild tables** (`src/db.ts:62-232`) — `foreign_keys = ON` is enabled but no FKs are declared. Missing: `messages.author_id` → `members(id)`, `message_edits.message_id` → `messages(id)`, `message_edits.author_id` → `members(id)`, `textfilter_logs.user_id` → `members(id)`, `ai_chat_log.user_id` → `members(id)`, `actionlogs.target_id` → `members(id)`, `modlogs.user_id` → `members(id)`.

M10. **Missing indexes on log tables** (`src/db.ts:97-157`) — `modlogs`, `saylogs`, and `textfilter_logs` all have `ORDER BY timestamp DESC` queries but no index on `timestamp`. Full table scan + sort on every log pane open.

M11. **`reports.total_members` stores message count** (`src/db.ts:92`) — In guild-scan reports, `total_members` is set to `COUNT(*) FROM messages`, not member count. Column name is misleading. **Fixed:** Column removed from schema, code now uses `message_count` consistently.

## Low

L1. **Dead `mainDb`** (`src/db.ts:47`) — LowDB is imported and `read()` called at startup but never used elsewhere.

L2. **Hardcoded colors in Analytics** (`frontend/src/lib/Analytics.svelte:147+`) — Violates the project's own "never hardcode colors" rule.

L3. **`@types/sharp` version mismatch** — `sharp@^0.35.3` but `@types/sharp@^0.31.1`.

L4. **CLI passwords visible in process listing** (`src/cli-users.ts:39`) — Passwords passed as CLI args are visible via `ps aux`.

L5. **No `aria-live` regions** — Screen readers aren't notified of dynamic status changes throughout the frontend.

L6. **Card collapse not keyboard-accessible** (`frontend/src/lib/Card.svelte:36-37`) — Click handler on `<div>` with a11y warnings suppressed. No `role="button"` or keyboard support.

L7. **Missing composite indexes for sort optimization** (`src/db.ts`) — `messages(author_id, created_at DESC)` and `messages(channel_id, created_at DESC)` would avoid sort steps for AI scan and channel message queries. `actionlogs(action, target_id, timestamp)` would optimize dedup queries in `messageDelete.ts` and `guildAuditLogEntryCreate.ts`.

L8. **`ref_entries` UPDATE TOCTOU race** (`src/web/server.ts:842-846`) — Checks for tag conflict then updates the PK. Concurrent requests can race between the check and update. Use `INSERT OR REPLACE` or handle the error.

L9. **No automated session cleanup** (`src/auth.ts:166`) — Expired sessions are only cleaned when a specific user creates a new session. Sessions for users who never log in again remain forever. Needs a periodic cleanup job.
