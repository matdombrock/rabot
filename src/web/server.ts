import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js";
import db from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createWebServer(client: Client) {
  const app = express();
  const port = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/guilds", async (_req, res) => {
    const guilds = client.guilds.cache.map((g) => ({ id: g.id, name: g.name }));
    res.json(guilds);
  });

  app.get("/api/reports/user-report/:guildId", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: "Guild not found" });
      return;
    }

    try {
      const { generateUserReport } = await import("../reports/user-report.js");
      const result = await generateUserReport(guild);
      res.json(result);
    } catch (err) {
      console.error("Report generation failed:", err);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/reports/quick-report/:guildId", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: "Guild not found" });
      return;
    }

    try {
      const { generateQuickReport } = await import("../reports/quick-report.js");
      const result = await generateQuickReport(guild);
      res.json(result);
    } catch (err) {
      console.error("Report generation failed:", err);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/info", async (_req, res) => {
    try {
      const wsPing = client.ws.ping;
      res.json({
        tag: client.user?.tag ?? "Unknown",
        uptime: client.uptime ?? 0,
        node: process.version,
        wsPing,
      });
    } catch (err) {
      console.error("Info endpoint error:", err);
      res.status(500).json({ error: "Failed to get info" });
    }
  });

  app.get("/api/history", async (_req, res) => {
    try {
      await db.read();
      const reports = (db.data?.reports ?? []).map(({ csv: _, ...rest }) => rest);
      res.json(reports);
    } catch (err) {
      console.error("History fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.get("/api/history/:id", async (req, res) => {
    try {
      await db.read();
      const report = db.data?.reports.find((r) => r.id === req.params.id);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      console.error("History fetch failed:", err);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  app.delete("/api/history/:id", async (req, res) => {
    try {
      await db.read();
      const index = db.data?.reports.findIndex((r) => r.id === req.params.id) ?? -1;
      if (index === -1) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      db.data!.reports.splice(index, 1);
      await db.write();
      res.json({ ok: true });
    } catch (err) {
      console.error("History delete failed:", err);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  app.get("/api/channels/:guildId", async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: "Guild not found" });
      return;
    }
    const channels = guild.channels.cache
      .filter((ch) => ch.isTextBased())
      .map((ch) => ({ id: ch.id, name: ch.name }));
    res.json(channels);
  });

  app.post("/api/send-message", async (req, res) => {
    const { guildId, channelId, content } = req.body;
    if (!guildId || !channelId || !content) {
      res.status(400).json({ error: "Missing guildId, channelId, or content" });
      return;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      res.status(404).json({ error: "Guild not found" });
      return;
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    try {
      await channel.send(content);
      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to send message:", err);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.get("/api/checksums", async (_req, res) => {
    await db.read();
    res.json({ checksums: db.data.checksums, action: db.data.action });
  });

  app.post("/api/checksums", async (req, res) => {
    const { checksum, label } = req.body;
    if (!checksum || typeof checksum !== "string") {
      res.status(400).json({ error: "Missing checksum" });
      return;
    }
    const c = checksum.toLowerCase();
    await db.read();
    if (db.data.checksums.some((e) => e.checksum === c)) {
      res.json({ ok: true });
      return;
    }
    db.data.checksums.push({ checksum: c, label: String(label ?? "") });
    await db.write();
    res.json({ ok: true });
  });

  app.delete("/api/checksums/:checksum", async (req, res) => {
    const c = req.params.checksum.toLowerCase();
    await db.read();
    const index = db.data.checksums.findIndex((e) => e.checksum === c);
    if (index === -1) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    db.data.checksums.splice(index, 1);
    await db.write();
    res.json({ ok: true });
  });

  app.put("/api/checksums/action", async (req, res) => {
    const { action } = req.body;
    if (action !== "ban" && action !== "kick") {
      res.status(400).json({ error: "Action must be ban or kick" });
      return;
    }
    await db.read();
    db.data.action = action;
    await db.write();
    res.json({ ok: true });
  });

  app.get("/api/modlogs", async (_req, res) => {
    await db.read();
    res.json(db.data.modlogs);
  });

  app.delete("/api/modlogs", async (_req, res) => {
    await db.read();
    db.data.modlogs = [];
    await db.write();
    res.json({ ok: true });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Express error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(port, () => {
    console.log(`Control panel running at http://localhost:${port}`);
  });
}
