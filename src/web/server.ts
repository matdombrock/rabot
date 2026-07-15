import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js";
import { getGuildDb } from "../db.js";
import { requireAuth, requireGuildAccess, mountAuthRoutes, type AuthRequest } from "./auth.js";
import { isSuperAdmin, getUserGuilds } from "../auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createWebServer(client: Client) {
  const app = express();
  const port = parseInt(process.env.PORT || "3000", 10); // PORT env var still supported for convenience

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  // ── Auth routes (public) ──
  mountAuthRoutes(app);

  // ── All guild routes require auth + guild access ──
  app.use("/api/guild/:guildId", requireAuth, requireGuildAccess);

  // ── Global routes ──

  app.get("/api/guilds", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const superadmin = isSuperAdmin(user.id);
    const assignedGuilds = superadmin ? null : getUserGuilds(user.id);

    const guilds = await Promise.all(client.guilds.cache.map(async (g) => {
      // Non-superadmins only see their assigned guilds
      if (!superadmin && !assignedGuilds!.includes(g.id)) return null;

      let onlineCount = 0;
      try {
        const fetched = await g.fetch();
        onlineCount = fetched.approximatePresenceCount ?? 0;
      } catch {}
      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        memberCount: g.memberCount,
        onlineCount,
      };
    }));
    res.json(guilds.filter(Boolean));
  });

  app.get("/api/info", requireAuth, async (_req, res) => {
    try {
      res.json({
        tag: client.user?.tag ?? "Unknown",
        uptime: client.uptime ?? 0,
        node: process.version,
        wsPing: client.ws.ping,
      });
    } catch (err) {
      console.error("Info endpoint error:", err);
      res.status(500).json({ error: "Failed to get info" });
    }
  });

  // ── Deep scan (cross-guild, requires auth) ──

  app.get("/api/deep-scan/:userId", requireAuth, async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      const guildResults: { guildId: string; guildName: string; username: string; displayName: string; avatarUrl: string; topRole: string; joinDate: string | null; messageCount: number }[] = [];
      let totalMessages = 0;

      for (const guild of client.guilds.cache.values()) {
        const db = getGuildDb(guild.id);
        const member = db.prepare("SELECT id, username, display_name, avatar_url, top_role, guild_join_date FROM members WHERE id = ?").get(targetUserId) as { id: string; username: string; display_name: string; avatar_url: string; top_role: string; guild_join_date: string } | undefined;
        if (!member) continue;

        const msgRow = db.prepare("SELECT COUNT(*) as count FROM messages WHERE author_id = ?").get(targetUserId) as { count: number };
        totalMessages += msgRow.count;

        guildResults.push({
          guildId: guild.id,
          guildName: guild.name,
          username: member.username,
          displayName: member.display_name,
          avatarUrl: member.avatar_url,
          topRole: member.top_role,
          joinDate: member.guild_join_date,
          messageCount: msgRow.count,
        });
      }

      res.json({
        userId: targetUserId,
        totalMessages,
        totalGuilds: guildResults.length,
        guilds: guildResults,
      });
    } catch (err) {
      console.error("Deep scan failed:", err);
      res.status(500).json({ error: "Failed to run deep scan" });
    }
  });

  // ── Guild-scoped routes ──

  app.get("/api/guild/:guildId/channels", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    const channels = guild.channels.cache
      .filter((ch) => ch.isTextBased())
      .map((ch) => ({ id: ch.id, name: ch.name }));
    res.json(channels);
  });

  app.get("/api/guild/:guildId/members", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const rows = db.prepare("SELECT id, username, display_name, avatar_url, watched FROM members ORDER BY username ASC").all();
    res.json(rows);
  });

  app.put("/api/guild/:guildId/members/:userId/watch", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const member = db.prepare("SELECT watched FROM members WHERE id = ?").get(req.params.userId) as { watched: number } | undefined;
      if (!member) { res.status(404).json({ error: "Member not found" }); return; }
      const newVal = member.watched ? 0 : 1;
      db.prepare("UPDATE members SET watched = ? WHERE id = ?").run(newVal, req.params.userId);
      res.json({ watched: !!newVal });
    } catch (err) {
      console.error("Watch toggle failed:", err);
      res.status(500).json({ error: "Failed to toggle watch" });
    }
  });

  app.get("/api/guild/:guildId/messages/:channelId", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const before = req.query.before as string | undefined;
      const search = req.query.q as string | undefined;
      const authorId = req.query.author_id as string | undefined;
      const hasUrl = req.query.has_url === "true";
      const hasImage = req.query.has_image === "true";
      const hasEveryone = req.query.has_everyone === "true";
      const showDeleted = req.query.show_deleted !== "false";
      const deletedOnly = req.query.deleted_only === "true";

      const conditions: string[] = [];
      const params: any[] = [];
      let rows: any[];

      if (search) { conditions.push("m.content LIKE ?"); params.push(`%${search}%`); }
      if (authorId) { conditions.push("m.author_id = ?"); params.push(authorId); }
      if (hasUrl) { conditions.push("(m.content LIKE '%http%' OR m.content LIKE 'www.%')"); }
      if (hasImage) { conditions.push("(m.content LIKE '%.png%' OR m.content LIKE '%.jpg%' OR m.content LIKE '%.jpeg%' OR m.content LIKE '%.gif%' OR m.content LIKE '%.webp%')"); }
      if (hasEveryone) { conditions.push("m.content LIKE '%@everyone%'"); }
      if (req.params.channelId !== "_all") { conditions.push("m.channel_id = ?"); params.push(req.params.channelId); }
      if (deletedOnly) {
        conditions.push("m.deleted = 1");
      } else if (!showDeleted) {
        conditions.push("m.deleted IS NOT 1");
      }

      const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
      const query = `SELECT m.*, u.username, u.display_name, u.avatar_url FROM messages m LEFT JOIN members u ON m.author_id = u.id ${where}${before ? " AND m.created_at < (SELECT created_at FROM messages WHERE id = ?)" : ""} ORDER BY m.created_at DESC LIMIT ?`;

      if (before) params.push(before);
      params.push(limit);
      rows = db.prepare(query).all(...params);

      const last = rows[rows.length - 1];
      res.json({ messages: rows, next: last ? last.id : null, search: !!search });
    } catch (err) {
      console.error("Messages fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // ── Export messages (full history, no pagination) ──

  app.get("/api/guild/:guildId/messages/:channelId/export", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const conditions: string[] = [];
      const params: any[] = [];

      if (req.params.channelId !== "_all") {
        conditions.push("m.channel_id = ?");
        params.push(req.params.channelId);
      }

      const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
      const query = `SELECT m.id, m.channel_id, m.author_id, m.content, m.created_at, m.deleted, u.username, u.display_name, u.avatar_url FROM messages m LEFT JOIN members u ON m.author_id = u.id ${where} ORDER BY m.created_at DESC`;
      const rows = db.prepare(query).all(...params);
      res.json({ messages: rows });
    } catch (err) {
      console.error("Messages export failed:", err);
      res.status(500).json({ error: "Failed to export messages" });
    }
  });

  // ── Delete message ──

  app.delete("/api/guild/:guildId/messages/:messageId", async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const messageId = req.params.messageId;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }

      // Look up the message in the database to find which channel it's in
      const db = getGuildDb(guildId);
      const msg = db.prepare("SELECT channel_id, author_id, content FROM messages WHERE id = ?").get(messageId) as { channel_id: string; author_id: string; content: string } | undefined;
      if (!msg) { res.status(404).json({ error: "Message not found in database" }); return; }

      // Try to delete from Discord
      let discordDeleted = false;
      const channel = guild.channels.cache.get(msg.channel_id);
      try {
        if (channel?.isTextBased()) {
          const discordMsg = await channel.messages.fetch(messageId);
          await discordMsg.delete();
          discordDeleted = true;
        }
      } catch (err) {
        console.warn("Failed to delete message from Discord (may already be deleted):", err);
      }

      // Mark as deleted in the database
      db.prepare("UPDATE messages SET deleted = 1 WHERE id = ?").run(messageId);

      // Resolve author name
      const author = db.prepare("SELECT username FROM members WHERE id = ?").get(msg.author_id) as { username: string } | undefined;
      const channelName = (channel as any)?.name ?? "unknown";

      // Log the action
      const logId = crypto.randomUUID();
      db.prepare(`INSERT INTO actionlogs (id, guild_id, guild_name, timestamp, action, target_id, target_name, channel_id, channel_name, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        logId,
        guildId,
        guild.name,
        new Date().toISOString(),
        "message-delete",
        msg.author_id,
        author?.username ?? msg.author_id,
        msg.channel_id,
        channelName,
        `Deleted message "${msg.content.slice(0, 200)}"`
      );

      res.json({ ok: true, discordDeleted, logId });
    } catch (err) {
      console.error("Delete message failed:", err);
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // ── Edit history ──

  app.get("/api/guild/:guildId/edits", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
      const before = req.query.before as string | undefined;
      const channelId = req.query.channel_id as string | undefined;
      const authorId = req.query.author_id as string | undefined;
      const messageId = req.query.message_id as string | undefined;
      const messageIds = req.query.message_ids as string | undefined;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (before) {
        conditions.push("e.edited_at < (SELECT edited_at FROM message_edits WHERE id = ?)");
        params.push(before);
      }
      if (channelId) { conditions.push("e.channel_id = ?"); params.push(channelId); }
      if (authorId) { conditions.push("e.author_id = ?"); params.push(authorId); }
      if (messageId) { conditions.push("e.message_id = ?"); params.push(messageId); }
      if (messageIds) {
        const ids = messageIds.split(",").filter(Boolean);
        if (ids.length) { conditions.push("e.message_id IN (" + ids.map(() => "?").join(",") + ")"); params.push(...ids); }
      }

      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      const rows = db.prepare(`SELECT e.*, m.username, m.display_name, m.avatar_url
        FROM message_edits e
        LEFT JOIN members m ON e.author_id = m.id
        ${where} ORDER BY e.edited_at DESC LIMIT ?`).all(...params, limit);
      const next = rows.length === limit ? (rows[rows.length - 1] as any).id : null;
      res.json({ edits: rows, next });
    } catch (err) {
      console.error("Edit history fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch edit history" });
    }
  });

  // ── Action log ──

  app.get("/api/guild/:guildId/actionlogs", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const rows = db.prepare("SELECT * FROM actionlogs ORDER BY timestamp DESC LIMIT 200").all();
      res.json(rows);
    } catch (err) {
      console.error("Action log fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch action log" });
    }
  });

  app.delete("/api/guild/:guildId/actionlogs", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      db.prepare("DELETE FROM actionlogs").run();
      res.json({ ok: true });
    } catch (err) {
      console.error("Action log clear failed:", err);
      res.status(500).json({ error: "Failed to clear action log" });
    }
  });

  // ── Analytics ──

  app.get("/api/guild/:guildId/analytics", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const guild = client.guilds.cache.get(req.params.guildId);

      // Date range filter
      const rangeDays = Math.min(parseInt(req.query.range as string) || 90, 1095);
      const rangeMs = rangeDays * 24 * 60 * 60 * 1000;
      const rangeDate = new Date(Date.now() - rangeMs).toISOString();

      // Interval grouping
      const interval = (req.query.interval as string) || 'day';
      let dateGroupExpr: string;
      let dateLabelExpr: string;
      if (interval === 'week') {
        dateGroupExpr = "strftime('%Y-W%W', datetime(created_at / 1000, 'unixepoch'))";
        dateLabelExpr = "strftime('%Y-W%W', datetime(created_at / 1000, 'unixepoch'))";
      } else if (interval === 'month') {
        dateGroupExpr = "strftime('%Y-%m', datetime(created_at / 1000, 'unixepoch'))";
        dateLabelExpr = "strftime('%Y-%m', datetime(created_at / 1000, 'unixepoch'))";
      } else {
        dateGroupExpr = "date(datetime(created_at / 1000, 'unixepoch'))";
        dateLabelExpr = "date(datetime(created_at / 1000, 'unixepoch'))";
      }

      let userDateGroupExpr: string;
      let userDateLabelExpr: string;
      if (interval === 'week') {
        userDateGroupExpr = "strftime('%Y-W%W', guild_join_date)";
        userDateLabelExpr = "strftime('%Y-W%W', guild_join_date)";
      } else if (interval === 'month') {
        userDateGroupExpr = "strftime('%Y-%m', guild_join_date)";
        userDateLabelExpr = "strftime('%Y-%m', guild_join_date)";
      } else {
        userDateGroupExpr = "date(guild_join_date)";
        userDateLabelExpr = "date(guild_join_date)";
      }

      // Total stats (always global, not filtered by range)
      const totalUsers = db.prepare("SELECT COUNT(*) as count FROM members").get() as { count: number };
      const totalMessages = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
      const avgDays = db.prepare("SELECT AVG(julianday('now') - julianday(guild_join_date)) as avg FROM members WHERE guild_join_date IS NOT NULL").get() as { avg: number | null };

      // Messages per interval
      const messagesByDay = db.prepare(`
        SELECT ${dateLabelExpr} as day, COUNT(*) as count
        FROM messages
        WHERE created_at > ?
        GROUP BY ${dateGroupExpr}
        ORDER BY day ASC
      `).all(Date.now() - rangeMs) as { day: string; count: number }[];

      // New users per interval
      const newUsersByDay = db.prepare(`
        SELECT ${userDateLabelExpr} as day, COUNT(*) as count
        FROM members
        WHERE guild_join_date IS NOT NULL AND guild_join_date > ?
        GROUP BY ${userDateGroupExpr}
        ORDER BY day ASC
      `).all(rangeDate) as { day: string; count: number }[];

      // Period stats
      const newUsersPeriod = db.prepare(`SELECT COUNT(*) as count FROM members WHERE guild_join_date IS NOT NULL AND guild_join_date > ?`).get(rangeDate) as { count: number };
      const messagesPeriod = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE created_at > ?`).get(Date.now() - rangeMs) as { count: number };

      // Messages per channel (for pie chart, range-filtered)
      const rawChannelCounts = db.prepare(`
        SELECT m.channel_id, COUNT(*) as count
        FROM messages m
        WHERE m.created_at > ?
        GROUP BY m.channel_id
        ORDER BY count DESC
      `).all(Date.now() - rangeMs) as { channel_id: string; count: number }[];

      // Resolve channel names from the guild
      const messagesPerChannel = rawChannelCounts.map(c => ({
        channelId: c.channel_id,
        channelName: guild?.channels.cache.get(c.channel_id)?.name ?? c.channel_id.slice(0, 8),
        count: c.count,
      }));

      // Messages per day of week (always last 7 days worth of data, averaged)
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 84); // 12 weeks to get decent averages
      const messagesByDayOfWeek = db.prepare(`
        SELECT CAST(strftime('%w', datetime(created_at / 1000, 'unixepoch')) AS INTEGER) as dayNum, COUNT(*) as count
        FROM messages
        WHERE created_at > ?
        GROUP BY dayNum
        ORDER BY dayNum
      `).all(weekStart.getTime()) as { dayNum: number; count: number }[];

      // Calculate weekly average per day of week
      const weeks = Math.max(1, Math.floor(84 / 7));
      const dowLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const messagesByDow = new Array(7).fill(0);
      for (const row of messagesByDayOfWeek) {
        messagesByDow[row.dayNum] = Math.round(row.count / weeks);
      }

      res.json({
        totalUsers: totalUsers.count,
        totalMessages: totalMessages.count,
        avgDaysInServer: Math.round((avgDays.avg ?? 0) * 10) / 10,
        rangeDays,
        interval,
        periodNewUsers: newUsersPeriod.count,
        periodMessages: messagesPeriod.count,
        messagesByDay,
        newUsersByDay,
        messagesPerChannel,
        messagesByDow: { labels: dowLabels, data: messagesByDow },

        // Top posters
        topPosters: db.prepare(`
          SELECT COALESCE(u.username, m.author_id) as username, COUNT(*) as count
          FROM messages m
          LEFT JOIN members u ON m.author_id = u.id
          WHERE m.created_at > ?
          GROUP BY m.author_id
          ORDER BY count DESC
          LIMIT 10
        `).all(Date.now() - rangeMs) as { username: string; count: number }[],

        // Messages by hour (24h)
        messagesByHour: db.prepare(`
          SELECT CAST(strftime('%H', datetime(created_at / 1000, 'unixepoch')) AS INTEGER) as hour, COUNT(*) as count
          FROM messages
          WHERE created_at > ?
          GROUP BY hour
          ORDER BY hour
        `).all(Date.now() - rangeMs) as { hour: number; count: number }[],

        // Deleted vs active
        deletedCount: (db.prepare("SELECT COUNT(*) as count FROM messages WHERE deleted = 1").get() as { count: number }).count,

        // Role distribution
        roleDistribution: db.prepare(`
          SELECT top_role, COUNT(*) as count
          FROM members
          WHERE top_role IS NOT NULL
          GROUP BY top_role
          ORDER BY count DESC
          LIMIT 10
        `).all() as { top_role: string; count: number }[],
      });
    } catch (err) {
      console.error("Analytics fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ── Reports ──

  app.get("/api/guild/:guildId/reports/quick-report", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    try {
      const { generateQuickReport } = await import("../reports/quick-report.js");
      const result = await generateQuickReport(guild);
      res.json(result);
    } catch (err) {
      console.error("Report generation failed:", err);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // ── Say ──

  app.post("/api/guild/:guildId/send-message", async (req, res) => {
    const guildId = req.params.guildId;
    const { channelId, content } = req.body;
    if (!channelId || !content) { res.status(400).json({ error: "Missing channelId or content" }); return; }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) { res.status(404).json({ error: "Channel not found" }); return; }

    let msg;
    try { msg = await channel.send(content); }
    catch (err) { console.error("Failed to send message:", err); res.status(500).json({ error: "Failed to send message" }); return; }

    try {
      const db = getGuildDb(guildId);
      db.prepare("INSERT INTO saylogs (id, timestamp, guild_id, guild_name, channel_id, channel_name, content, message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        crypto.randomUUID(), new Date().toISOString(), guildId, guild.name, channelId, (channel as any).name ?? "unknown", content, msg.id
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to log message:", err);
      res.json({ ok: true, warning: "Message sent but not logged" });
    }
  });

  app.get("/api/guild/:guildId/saylogs", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const rows = db.prepare("SELECT * FROM saylogs ORDER BY timestamp DESC").all();
    res.json(rows);
  });

  app.delete("/api/guild/:guildId/saylogs/:id", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const entry = db.prepare("SELECT * FROM saylogs WHERE id = ?").get(req.params.id) as any;
      if (!entry) { res.status(404).json({ error: "Not found" }); return; }

      const guild = client.guilds.cache.get(entry.guild_id);
      if (guild) {
        const channel = guild.channels.cache.get(entry.channel_id);
        if (channel?.isTextBased()) {
          try { const m = await channel.messages.fetch(entry.message_id); await m.delete(); } catch { }
        }
      }

      db.prepare("DELETE FROM saylogs WHERE id = ?").run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to delete say log:", err);
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  // ── Reports history ──

  app.get("/api/guild/:guildId/history", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const rows = db.prepare("SELECT id, guild_name, type, generated, total_members, username, message_count, channel_id FROM reports ORDER BY generated DESC").all();
      res.json(rows);
    } catch (err) {
      console.error("History fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.get("/api/guild/:guildId/history/:id", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id) as any;
      if (!row) { res.status(404).json({ error: "Report not found" }); return; }
      res.json(row);
    } catch (err) {
      console.error("History fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  app.delete("/api/guild/:guildId/history/:id", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const result = db.prepare("DELETE FROM reports WHERE id = ?").run(req.params.id);
      if (result.changes === 0) { res.status(404).json({ error: "Report not found" }); return; }
      res.json({ ok: true });
    } catch (err) {
      console.error("History delete failed:", err);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // ── User analysis ──

  app.get("/api/guild/:guildId/user-analysis/:userId", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    try {
      const { generateUserAnalysis } = await import("../reports/user-analysis.js");
      const result = await generateUserAnalysis(guild, req.params.userId);
      const db = getGuildDb(req.params.guildId);
      db.prepare("INSERT INTO reports (id, guild_name, type, generated, total_members, username, csv) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        crypto.randomUUID(), guild.name, "analysis", result.generated, 1, result.username, result.csv
      );
      res.json(result);
    } catch (err) {
      console.error("User analysis failed:", err);
      res.status(500).json({ error: "Failed to analyze user" });
    }
  });

  // ── AI scan ──

  // ── AI scan ──

  app.get("/api/guild/:guildId/user-ai-scan/:userId", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    try {
      const force = req.query.force === "true";
      const { generateAiScan, saveAiScanResult } = await import("../reports/ai-scan.js");
      const result = await generateAiScan(guild, req.params.userId, force);
      if (!result.error && !result.cached) {
        saveAiScanResult(req.params.guildId, guild.name, result.username, result.analysis, result.riskScore, result.niceScore, result.weirdScore, result.spammerScore, result.aiScore);
      }
      res.json(result);
    } catch (err) {
      console.error("AI scan failed:", err);
      res.status(500).json({ error: "Failed to run AI scan" });
    }
  });

  // ── AI channel summary ──

  app.get("/api/guild/:guildId/channel-summary/:channelId", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    const force = req.query.force === "true";
    try {
      const { getChannelSummary } = await import("../reports/ai-channel-summary.js");
      const result = await getChannelSummary(guild, req.params.channelId, force);
      res.json(result);
    } catch (err) {
      console.error("Channel summary failed:", err);
      res.status(500).json({ error: "Failed to generate channel summary" });
    }
  });

  // ── AI guild scan ──

  app.get("/api/guild/:guildId/guild-scan", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    const force = req.query.force === "true";
    try {
      const { generateGuildScan } = await import("../reports/ai-guild-scan.js");
      const result = await generateGuildScan(guild, force);
      res.json(result);
    } catch (err) {
      console.error("Guild scan failed:", err);
      res.status(500).json({ error: "Failed to run guild scan" });
    }
  });

  // ── AI Chat ──

  app.get("/api/guild/:guildId/ai-chat", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const enabledRow = db.prepare("SELECT value FROM config WHERE key = 'aichat_enabled'").get() as { value: string } | undefined;
      const promptRow = db.prepare("SELECT value FROM config WHERE key = 'aichat_prompt'").get() as { value: string } | undefined;
      const logs = db.prepare("SELECT * FROM ai_chat_log WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100").all(req.params.guildId);
      res.json({ enabled: enabledRow?.value === "true", prompt: promptRow?.value ?? "", logs });
    } catch (err) {
      console.error("AI chat fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch AI chat data" });
    }
  });

  app.put("/api/guild/:guildId/ai-chat/toggle", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const enabledRow = db.prepare("SELECT value FROM config WHERE key = 'aichat_enabled'").get() as { value: string } | undefined;
      const newVal = enabledRow?.value === "true" ? "false" : "true";
      db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('aichat_enabled', ?)").run(newVal);
      res.json({ enabled: newVal === "true" });
    } catch (err) {
      console.error("AI chat toggle failed:", err);
      res.status(500).json({ error: "Failed to toggle AI chat" });
    }
  });

  app.put("/api/guild/:guildId/ai-chat/prompt", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const { prompt } = req.body;
      if (typeof prompt !== "string") { res.status(400).json({ error: "Missing prompt" }); return; }
      if (prompt.length > 1024) { res.status(400).json({ error: "Prompt must be 1024 characters or fewer" }); return; }
      const existing = db.prepare("SELECT value FROM config WHERE key = 'aichat_prompt'").get() as { value: string } | undefined;
      if (existing) {
        db.prepare("UPDATE config SET value = ? WHERE key = 'aichat_prompt'").run(prompt);
      } else {
        db.prepare("INSERT INTO config (key, value) VALUES ('aichat_prompt', ?)").run(prompt);
      }
      res.json({ ok: true, prompt });
    } catch (err) {
      console.error("AI chat prompt save failed:", err);
      res.status(500).json({ error: "Failed to save prompt" });
    }
  });

  app.delete("/api/guild/:guildId/ai-chat/log/:logId", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const entry = db.prepare("SELECT * FROM ai_chat_log WHERE id = ?").get(req.params.logId) as { response_message_id: string; ack_message_id: string; channel_id: string } | undefined;
      if (!entry) { res.status(404).json({ error: "Log not found" }); return; }

      const guild = client.guilds.cache.get(req.params.guildId);
      const { ack_message_id, response_message_id, channel_id } = entry;

      // Delete both the ack and the response from Discord
      for (const msgId of [ack_message_id, response_message_id]) {
        if (!msgId) continue;
        try {
          const channel = guild?.channels.cache.get(channel_id);
          if (channel?.isTextBased()) {
            const msg = await channel.messages.fetch(msgId);
            await msg.delete();
          }
        } catch {}
      }

      db.prepare("DELETE FROM ai_chat_log WHERE id = ?").run(req.params.logId);
      res.json({ ok: true });
    } catch (err) {
      console.error("AI chat log delete failed:", err);
      res.status(500).json({ error: "Failed to delete log" });
    }
  });

  // ── AI Image Describe ──

  app.get("/api/guild/:guildId/ai-image-describe", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const enabledRow = db.prepare("SELECT value FROM config WHERE key = 'aiimagedescribe_enabled'").get() as { value: string } | undefined;
      res.json({ enabled: enabledRow?.value === "true" });
    } catch (err) {
      console.error("AI image describe fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch AI image describe data" });
    }
  });

  app.put("/api/guild/:guildId/ai-image-describe/toggle", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      const enabledRow = db.prepare("SELECT value FROM config WHERE key = 'aiimagedescribe_enabled'").get() as { value: string } | undefined;
      const newVal = enabledRow?.value === "true" ? "false" : "true";
      db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('aiimagedescribe_enabled', ?)").run(newVal);
      res.json({ enabled: newVal === "true" });
    } catch (err) {
      console.error("AI image describe toggle failed:", err);
      res.status(500).json({ error: "Failed to toggle AI image describe" });
    }
  });

  // ── Image check ──

  app.get("/api/guild/:guildId/checksums", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const checksums = db.prepare("SELECT checksum, label FROM checksums").all();
    const actionRow = db.prepare("SELECT value FROM config WHERE key = 'action'").get() as { value: string } | undefined;
    res.json({ checksums, action: actionRow?.value ?? "ban" });
  });

  app.post("/api/guild/:guildId/checksums", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const { checksum, label } = req.body;
    if (!checksum || typeof checksum !== "string") { res.status(400).json({ error: "Missing checksum" }); return; }
    const c = checksum.toLowerCase();
    const existing = db.prepare("SELECT checksum FROM checksums WHERE checksum = ?").get(c);
    if (existing) { res.json({ ok: true }); return; }
    db.prepare("INSERT INTO checksums (checksum, label) VALUES (?, ?)").run(c, String(label ?? ""));
    res.json({ ok: true });
  });

  app.put("/api/guild/:guildId/checksums/action", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const { action } = req.body;
    if (action !== "ban" && action !== "kick") { res.status(400).json({ error: "Action must be ban or kick" }); return; }
    db.prepare("UPDATE config SET value = ? WHERE key = 'action'").run(action);
    res.json({ ok: true });
  });

  app.delete("/api/guild/:guildId/checksums/:checksum", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const result = db.prepare("DELETE FROM checksums WHERE checksum = ?").run(req.params.checksum.toLowerCase());
    if (result.changes === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  });

  app.get("/api/guild/:guildId/modlogs", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const rows = db.prepare("SELECT * FROM modlogs ORDER BY timestamp DESC").all();
    res.json(rows);
  });

  app.delete("/api/guild/:guildId/modlogs", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    db.prepare("DELETE FROM modlogs").run();
    res.json({ ok: true });
  });

  // ── Text filter ──

  app.get("/api/guild/:guildId/textfilters", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const rows = db.prepare("SELECT id, pattern, action, label FROM textfilters ORDER BY created_at DESC").all();
    res.json(rows);
  });

  app.post("/api/guild/:guildId/textfilters", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const { pattern, action, label } = req.body;
    if (!pattern || typeof pattern !== "string") { res.status(400).json({ error: "Missing pattern" }); return; }
    if (!["warn", "kick", "ban"].includes(action)) { res.status(400).json({ error: "Action must be warn, kick, or ban" }); return; }
    db.prepare("INSERT INTO textfilters (id, pattern, action, label, created_at) VALUES (?, ?, ?, ?, ?)").run(
      crypto.randomUUID(), pattern, action, String(label ?? ""), new Date().toISOString()
    );
    res.json({ ok: true });
  });

  app.delete("/api/guild/:guildId/textfilters/:id", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const result = db.prepare("DELETE FROM textfilters WHERE id = ?").run(req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  });

  app.get("/api/guild/:guildId/textfilter-logs", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const rows = db.prepare("SELECT * FROM textfilter_logs ORDER BY timestamp DESC LIMIT 100").all();
    res.json(rows);
  });

  // ── ──

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Express error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(port, () => {
    console.log(`Control panel running at http://localhost:${port}`);
  });
}
