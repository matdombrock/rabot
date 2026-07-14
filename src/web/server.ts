import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js";
import { getGuildDb } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createWebServer(client: Client) {
  const app = express();
  const port = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  // ── Global routes ──

  app.get("/api/guilds", async (_req, res) => {
    const guilds = client.guilds.cache.map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
    res.json(guilds);
  });

  app.get("/api/info", async (_req, res) => {
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
    const rows = db.prepare("SELECT id, username, display_name, avatar_url FROM members ORDER BY username ASC").all();
    res.json(rows);
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

      const conditions: string[] = [];
      const params: any[] = [];
      let rows: any[];

      if (search) { conditions.push("m.content LIKE ?"); params.push(`%${search}%`); }
      if (authorId) { conditions.push("m.author_id = ?"); params.push(authorId); }
      if (hasUrl) { conditions.push("(m.content LIKE '%http%' OR m.content LIKE 'www.%')"); }
      if (hasImage) { conditions.push("(m.content LIKE '%.png%' OR m.content LIKE '%.jpg%' OR m.content LIKE '%.jpeg%' OR m.content LIKE '%.gif%' OR m.content LIKE '%.webp%')"); }
      if (hasEveryone) { conditions.push("m.content LIKE '%@everyone%'"); }
      if (req.params.channelId !== "_all") { conditions.push("m.channel_id = ?"); params.push(req.params.channelId); }

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

  app.get("/api/guild/:guildId/reports/user-report", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    try {
      const { generateUserReport } = await import("../reports/user-report.js");
      const result = await generateUserReport(guild);
      const db = getGuildDb(req.params.guildId);
      db.prepare("INSERT INTO reports (id, guild_name, type, generated, total_members, csv) VALUES (?, ?, ?, ?, ?, ?)").run(
        crypto.randomUUID(), guild.name, "full", result.generated, result.totalMembers, result.csv
      );
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
      const rows = db.prepare("SELECT id, guild_name, type, generated, total_members, username FROM reports ORDER BY generated DESC").all();
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
