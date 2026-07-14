import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js";
import { getGuildDb, readGuildDb } from "../db.js";

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
      await db.reports.read();
      db.reports.data.reports.push({
        id: crypto.randomUUID(),
        guildId: guild.id,
        guildName: guild.name,
        type: "full",
        generated: result.generated,
        totalMembers: result.totalMembers,
        csv: result.csv,
      });
      await db.reports.write();
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
    if (!channelId || !content) {
      res.status(400).json({ error: "Missing channelId or content" }); return;
    }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) { res.status(404).json({ error: "Channel not found" }); return; }

    let msg;
    try { msg = await channel.send(content); }
    catch (err) { console.error("Failed to send message:", err); res.status(500).json({ error: "Failed to send message" }); return; }

    try {
      const db = getGuildDb(guildId);
      await db.say.read();
      db.say.data.saylogs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        guildId,
        guildName: guild.name,
        channelId,
        channelName: (channel as any).name ?? "unknown",
        content,
        messageId: msg.id,
      });
      await db.say.write();
      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to log message:", err);
      res.json({ ok: true, warning: "Message sent but not logged" });
    }
  });

  app.get("/api/guild/:guildId/saylogs", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    await db.say.read();
    res.json(db.say.data.saylogs);
  });

  app.delete("/api/guild/:guildId/saylogs/:id", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      await db.say.read();
      const index = db.say.data.saylogs.findIndex((e) => e.id === req.params.id);
      if (index === -1) { res.status(404).json({ error: "Not found" }); return; }
      const entry = db.say.data.saylogs[index];

      const guild = client.guilds.cache.get(entry.guildId);
      if (guild) {
        const channel = guild.channels.cache.get(entry.channelId);
        if (channel?.isTextBased()) {
          try { const m = await channel.messages.fetch(entry.messageId); await m.delete(); } catch { }
        }
      }

      db.say.data.saylogs.splice(index, 1);
      await db.say.write();
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
      await db.reports.read();
      const reports = (db.reports.data?.reports ?? []).map(({ csv: _, ...rest }) => rest);
      res.json(reports);
    } catch (err) {
      console.error("History fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.get("/api/guild/:guildId/history/:id", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      await db.reports.read();
      const report = db.reports.data?.reports.find((r) => r.id === req.params.id);
      if (!report) { res.status(404).json({ error: "Report not found" }); return; }
      res.json(report);
    } catch (err) {
      console.error("History fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  app.delete("/api/guild/:guildId/history/:id", async (req, res) => {
    try {
      const db = getGuildDb(req.params.guildId);
      await db.reports.read();
      const index = db.reports.data?.reports.findIndex((r) => r.id === req.params.id) ?? -1;
      if (index === -1) { res.status(404).json({ error: "Report not found" }); return; }
      db.reports.data!.reports.splice(index, 1);
      await db.reports.write();
      res.json({ ok: true });
    } catch (err) {
      console.error("History delete failed:", err);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // ── Image check ──

  app.get("/api/guild/:guildId/checksums", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    await db.imageCheck.read();
    res.json({ checksums: db.imageCheck.data.checksums, action: db.imageCheck.data.action });
  });

  app.post("/api/guild/:guildId/checksums", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const { checksum, label } = req.body;
    if (!checksum || typeof checksum !== "string") { res.status(400).json({ error: "Missing checksum" }); return; }
    const c = checksum.toLowerCase();
    await db.imageCheck.read();
    if (db.imageCheck.data.checksums.some((e) => e.checksum === c)) { res.json({ ok: true }); return; }
    db.imageCheck.data.checksums.push({ checksum: c, label: String(label ?? "") });
    await db.imageCheck.write();
    res.json({ ok: true });
  });

  app.put("/api/guild/:guildId/checksums/action", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const { action } = req.body;
    if (action !== "ban" && action !== "kick") { res.status(400).json({ error: "Action must be ban or kick" }); return; }
    await db.imageCheck.read();
    db.imageCheck.data.action = action;
    await db.imageCheck.write();
    res.json({ ok: true });
  });

  app.delete("/api/guild/:guildId/checksums/:checksum", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    const c = req.params.checksum.toLowerCase();
    await db.imageCheck.read();
    const index = db.imageCheck.data.checksums.findIndex((e) => e.checksum === c);
    if (index === -1) { res.status(404).json({ error: "Not found" }); return; }
    db.imageCheck.data.checksums.splice(index, 1);
    await db.imageCheck.write();
    res.json({ ok: true });
  });

  app.get("/api/guild/:guildId/modlogs", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    await db.imageCheck.read();
    res.json(db.imageCheck.data.modlogs);
  });

  app.delete("/api/guild/:guildId/modlogs", async (req, res) => {
    const db = getGuildDb(req.params.guildId);
    await db.imageCheck.read();
    db.imageCheck.data.modlogs = [];
    await db.imageCheck.write();
    res.json({ ok: true });
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
