import express from "express";
import {
  authenticateUser,
  createSession,
  deleteSession,
  validateSession,
  extractSessionToken,
  getUserGuilds,
  isSuperAdmin,
  createUser,
  deleteUser,
  assignGuild,
  revokeGuild,
  setSuperadmin,
  listUsers,
} from "../auth.js";
import type { User } from "../auth.js";

export interface AuthRequest extends express.Request {
  user?: User;
}

// ── Auth middleware ──

export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = extractSessionToken(req.headers.cookie);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const user = validateSession(token);
  if (!user) { res.status(401).json({ error: "Invalid session" }); return; }
  (req as AuthRequest).user = user;
  next();
}

export function requireGuildAccess(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const user = (req as AuthRequest).user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const guildId = String(req.params.guildId);
  if (!isSuperAdmin(user.id)) {
    const guilds = getUserGuilds(user.id);
    if (!guilds.includes(guildId)) { res.status(403).json({ error: "No access to this guild" }); return; }
  }
  next();
}

// ── Auth routes ──

export function mountAuthRoutes(app: express.Application): void {
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) { res.status(400).json({ error: "Missing username or password" }); return; }

    const user = authenticateUser(username, password);
    if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const token = createSession(user.id);
    res.setHeader("Set-Cookie", `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    res.json({ ok: true });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = extractSessionToken(req.headers.cookie);
    if (token) deleteSession(token);
    res.setHeader("Set-Cookie", "session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const token = extractSessionToken(req.headers.cookie);
    if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
    const user = validateSession(token);
    if (!user) { res.status(401).json({ error: "Invalid session" }); return; }

    const superadmin = isSuperAdmin(user.id);
    const assignedGuilds = superadmin ? [] : getUserGuilds(user.id);

    res.json({
      id: user.id,
      username: user.username,
      isSuperadmin: superadmin,
      assignedGuilds,
    });
  });

  app.get("/api/auth/user-guilds", requireAuth, (req, res) => {
    const user = (req as AuthRequest).user!;
    if (isSuperAdmin(user.id)) {
      res.json({ superadmin: true, guilds: [] });
      return;
    }
    const guildIds = getUserGuilds(user.id);
    res.json({ superadmin: false, guilds: guildIds });
  });

  // ── User management (superadmin only) ──

  app.get("/api/auth/users", requireAuth, (req, res) => {
    const user = (req as AuthRequest).user!;
    if (!isSuperAdmin(user.id)) { res.status(403).json({ error: "Superadmin required" }); return; }

    const users = listUsers().map(u => ({
      id: u.id,
      username: u.username,
      isSuperadmin: u.is_superadmin === 1,
      created_at: u.created_at,
      guilds: getUserGuilds(u.id),
    }));
    res.json(users);
  });

  app.post("/api/auth/users", requireAuth, (req, res) => {
    const user = (req as AuthRequest).user!;
    if (!isSuperAdmin(user.id)) { res.status(403).json({ error: "Superadmin required" }); return; }

    const { username, password, superadmin } = req.body;
    if (!username || !password) { res.status(400).json({ error: "Missing username or password" }); return; }

    try {
      const newUser = createUser(username, password, !!superadmin);
      res.json({ ok: true, id: newUser.id, username: newUser.username });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/auth/users/:username", requireAuth, (req, res) => {
    const user = (req as AuthRequest).user!;
    if (!isSuperAdmin(user.id)) { res.status(403).json({ error: "Superadmin required" }); return; }

    const deleted = deleteUser(String(req.params.username));
    if (!deleted) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ ok: true });
  });

  app.post("/api/auth/users/:username/assign", requireAuth, (req, res) => {
    const user = (req as AuthRequest).user!;
    if (!isSuperAdmin(user.id)) { res.status(403).json({ error: "Superadmin required" }); return; }

    const { guildId } = req.body;
    if (!guildId) { res.status(400).json({ error: "Missing guildId" }); return; }

    const ok = assignGuild(String(req.params.username), guildId);
    if (!ok) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ ok: true });
  });

  app.delete("/api/auth/users/:username/assign/:guildId", requireAuth, (req, res) => {
    const user = (req as AuthRequest).user!;
    if (!isSuperAdmin(user.id)) { res.status(403).json({ error: "Superadmin required" }); return; }

    const ok = revokeGuild(String(req.params.username), String(req.params.guildId));
    if (!ok) { res.status(404).json({ error: "Assignment not found" }); return; }
    res.json({ ok: true });
  });

  app.post("/api/auth/users/:username/superadmin", requireAuth, (req, res) => {
    const user = (req as AuthRequest).user!;
    if (!isSuperAdmin(user.id)) { res.status(403).json({ error: "Superadmin required" }); return; }

    const { superadmin } = req.body;
    const ok = setSuperadmin(String(req.params.username), !!superadmin);
    if (!ok) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ ok: true });
  });
}
