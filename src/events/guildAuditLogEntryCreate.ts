import { Events, AuditLogEvent, type GuildAuditLogsEntry, type Guild } from "discord.js";
import crypto from "node:crypto";
import type { Event } from "../types.js";
import { getGuildDb } from "../db.js";

// Audit log actions we care about tracking
const WATCHED_ACTIONS = new Set([
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberBanRemove,
  AuditLogEvent.MemberKick,
  AuditLogEvent.MemberDisconnect,
  AuditLogEvent.MemberMove,
  AuditLogEvent.MemberRoleUpdate,
  AuditLogEvent.MemberUpdate,
  AuditLogEvent.MessageDelete,
  AuditLogEvent.MessageBulkDelete,
  AuditLogEvent.MessagePin,
  AuditLogEvent.MessageUnpin,
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.ChannelUpdate,
  AuditLogEvent.ThreadCreate,
  AuditLogEvent.ThreadDelete,
  AuditLogEvent.ThreadUpdate,
  AuditLogEvent.RoleCreate,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.RoleUpdate,
  AuditLogEvent.BotAdd,
  AuditLogEvent.EmojiCreate,
  AuditLogEvent.EmojiDelete,
  AuditLogEvent.StickerCreate,
  AuditLogEvent.StickerDelete,
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.WebhookDelete,
  AuditLogEvent.WebhookUpdate,
  AuditLogEvent.ApplicationCommandPermissionUpdate,
  AuditLogEvent.AutoModerationBlockMessage,
  AuditLogEvent.AutoModerationFlagToChannel,
  AuditLogEvent.AutoModerationUserCommunicationDisabled,
  AuditLogEvent.InviteCreate,
  AuditLogEvent.InviteDelete,
  AuditLogEvent.GuildUpdate,
]);

function actionName(action: AuditLogEvent): string {
  const map: Record<number, string> = {
    [AuditLogEvent.MemberBanAdd]: "member-ban",
    [AuditLogEvent.MemberBanRemove]: "member-unban",
    [AuditLogEvent.MemberKick]: "member-kick",
    [AuditLogEvent.MemberDisconnect]: "member-disconnect",
    [AuditLogEvent.MemberMove]: "member-move",
    [AuditLogEvent.MemberRoleUpdate]: "member-role-update",
    [AuditLogEvent.MemberUpdate]: "member-update",
    [AuditLogEvent.MessageDelete]: "audit-message-delete",
    [AuditLogEvent.MessageBulkDelete]: "audit-message-bulk-delete",
    [AuditLogEvent.MessagePin]: "message-pin",
    [AuditLogEvent.MessageUnpin]: "message-unpin",
    [AuditLogEvent.ChannelCreate]: "channel-create",
    [AuditLogEvent.ChannelDelete]: "channel-delete",
    [AuditLogEvent.ChannelUpdate]: "channel-update",
    [AuditLogEvent.ThreadCreate]: "thread-create",
    [AuditLogEvent.ThreadDelete]: "thread-delete",
    [AuditLogEvent.ThreadUpdate]: "thread-update",
    [AuditLogEvent.RoleCreate]: "role-create",
    [AuditLogEvent.RoleDelete]: "role-delete",
    [AuditLogEvent.RoleUpdate]: "role-update",
    [AuditLogEvent.BotAdd]: "bot-add",
    [AuditLogEvent.EmojiCreate]: "emoji-create",
    [AuditLogEvent.EmojiDelete]: "emoji-delete",
    [AuditLogEvent.StickerCreate]: "sticker-create",
    [AuditLogEvent.StickerDelete]: "sticker-delete",
    [AuditLogEvent.WebhookCreate]: "webhook-create",
    [AuditLogEvent.WebhookDelete]: "webhook-delete",
    [AuditLogEvent.WebhookUpdate]: "webhook-update",
    [AuditLogEvent.ApplicationCommandPermissionUpdate]: "cmd-perms-update",
    [AuditLogEvent.AutoModerationBlockMessage]: "automod-block",
    [AuditLogEvent.AutoModerationFlagToChannel]: "automod-flag",
    [AuditLogEvent.AutoModerationUserCommunicationDisabled]: "automod-timeout",
    [AuditLogEvent.InviteCreate]: "invite-create",
    [AuditLogEvent.InviteDelete]: "invite-delete",
    [AuditLogEvent.GuildUpdate]: "guild-update",
  };
  return map[action] ?? `audit-${action}`;
}

const guildAuditLogEntryCreate: Event = {
  name: Events.GuildAuditLogEntryCreate,
  async execute(entry: GuildAuditLogsEntry, guild: Guild) {
    const action = entry.action as AuditLogEvent;

    // Only log actions we care about
    if (!WATCHED_ACTIONS.has(action)) return;

    // Skip message deletions that were initiated by our own web panel
    // (those are already logged as 'message-delete' by the API endpoint)
    if (action === AuditLogEvent.MessageDelete || action === AuditLogEvent.MessageBulkDelete) {
      const db = getGuildDb(guild.id);
      const recent = db.prepare("SELECT id FROM log_action WHERE action = 'message-delete' AND timestamp > ?").get(new Date(Date.now() - 3000).toISOString()) as { id: string } | undefined;
      if (recent) return;
    }

    const db = getGuildDb(guild.id);
    const timestamp = new Date().toISOString();

    const executorId = entry.executorId ?? "";
    const executorName = entry.executor?.username ?? executorId;

    const targetId = entry.targetId ?? "";

    // Try to get channel info from extra data
    const extra = entry.extra as Record<string, unknown> | null | undefined;
    let channelId = "";
    let channelName = "";
    if (extra && typeof extra === "object") {
      if ("channel" in extra) {
        const ch = extra.channel as Record<string, unknown> | null;
        if (ch) {
          channelId = String(ch.id ?? "");
          channelName = String(ch.name ?? "");
        }
      }
    }

    const details = [
      executorName ? `by ${executorName}` : "",
      targetId ? `on ${targetId}` : "",
      channelName ? `in #${channelName}` : "",
      entry.reason ? `reason: ${entry.reason}` : "",
    ].filter(Boolean).join(" ");

    const logId = crypto.randomUUID();
    db.prepare(`INSERT INTO log_action (id, guild_id, guild_name, timestamp, action, target_id, target_name, channel_id, channel_name, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      logId,
      guild.id,
      guild.name,
      timestamp,
      actionName(action),
      targetId,
      entry.executor?.username ?? executorId,
      channelId,
      channelName,
      details || actionName(action)
    );
  },
};

export default guildAuditLogEntryCreate;
