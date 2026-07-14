import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  setSuperadmin,
  assignGuild,
  revokeGuild,
  getUserGuilds,
  getAuthDb,
} from "./auth.js";

function usage(): never {
  console.log(`Usage: npm run user -- <command>

Commands:
  create <username> <password>              Create a new user
  delete <username>                         Delete a user
  superadmin <username> [on|off]            Toggle superadmin (default: on)
  assign <username> <guildId>               Assign a user to a guild
  revoke <username> <guildId>               Remove a user's guild access
  list                                      List all users
  password <username> <newPassword>         Reset a user's password
  init                                      Create the first superadmin user
`);
  process.exit(1);
}

// Ensure auth DB is initialized
getAuthDb();

const [,, command, ...args] = process.argv;

if (!command) usage();

switch (command) {
  case "create": {
    const [username, password] = args;
    if (!username || !password) { console.error("Usage: create <username> <password>"); process.exit(1); }
    try {
      const user = createUser(username, password);
      console.log(`Created user "${username}" (id: ${user.id})`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    break;
  }

  case "delete": {
    const [username] = args;
    if (!username) { console.error("Usage: delete <username>"); process.exit(1); }
    const deleted = deleteUser(username);
    if (deleted) {
      console.log(`Deleted user "${username}"`);
    } else {
      console.error(`User "${username}" not found`);
      process.exit(1);
    }
    break;
  }

  case "superadmin": {
    const [username, value] = args;
    if (!username) { console.error("Usage: superadmin <username> [on|off]"); process.exit(1); }
    const on = value !== "off";
    const ok = setSuperadmin(username, on);
    if (ok) {
      console.log(`User "${username}" ${on ? "is now a superadmin" : "is no longer a superadmin"}`);
    } else {
      console.error(`User "${username}" not found`);
      process.exit(1);
    }
    break;
  }

  case "assign": {
    const [username, guildId] = args;
    if (!username || !guildId) { console.error("Usage: assign <username> <guildId>"); process.exit(1); }
    const ok = assignGuild(username, guildId);
    if (ok) {
      console.log(`Assigned guild ${guildId} to "${username}"`);
    } else {
      console.error(`User "${username}" not found`);
      process.exit(1);
    }
    break;
  }

  case "revoke": {
    const [username, guildId] = args;
    if (!username || !guildId) { console.error("Usage: revoke <username> <guildId>"); process.exit(1); }
    const ok = revokeGuild(username, guildId);
    if (ok) {
      console.log(`Revoked guild ${guildId} from "${username}"`);
    } else {
      console.error(`Assignment not found`);
      process.exit(1);
    }
    break;
  }

  case "list": {
    const users = listUsers();
    if (users.length === 0) {
      console.log("No users found. Create one with: npm run user -- create <username> <password>");
      break;
    }
    console.log(`\n${"Username".padEnd(20)} ${"Superadmin".padEnd(12)} Guilds`);
    console.log("-".repeat(60));
    for (const u of users) {
      const guilds = getUserGuilds(u.id);
      const sa = u.is_superadmin ? "yes" : "";
      console.log(`${u.username.padEnd(20)} ${sa.padEnd(12)} ${guilds.length > 0 ? guilds.join(", ") : "-"}`);
    }
    console.log();
    break;
  }

  case "password": {
    const [username, newPassword] = args;
    if (!username || !newPassword) { console.error("Usage: password <username> <newPassword>"); process.exit(1); }
    const user = getUser(username);
    if (!user) { console.error(`User "${username}" not found`); process.exit(1); }
    // Re-create user with new password — delete and recreate preserving guilds and superadmin
    const guilds = getUserGuilds(user.id);
    const sa = user.is_superadmin === 1;
    deleteUser(username);
    const newUser = createUser(username, newPassword, sa);
    for (const g of guilds) assignGuild(username, g);
    console.log(`Reset password for "${username}"`);
    break;
  }

  case "init": {
    const existing = listUsers();
    if (existing.length > 0) {
      console.error("Users already exist. Use 'create' to add new users.");
      process.exit(1);
    }
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>(r => rl.question(q, r));

    const username = await ask("Username: ");
    const password = await ask("Password: ");
    rl.close();

    if (!username || !password) { console.error("Username and password are required"); process.exit(1); }

    const user = createUser(username, password, true);
    console.log(`\nCreated superadmin "${username}" (id: ${user.id})`);
    console.log(`You can now log in at the web panel.\n`);
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    usage();
}
