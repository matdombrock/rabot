import { Client, Events, GatewayIntentBits, type TextChannel } from "discord.js";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { config } from "./config.js";
import { getGuildDb } from "./db.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface BackfillProgress {
  membersScanned?: boolean;
  channels: Record<string, { lastMessageId?: string; complete?: boolean }>;
}

async function backfill() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);

    let guilds = [...client.guilds.cache.values()];
    if (config.guildId) {
      const g = client.guilds.cache.get(config.guildId);
      if (!g) { console.error("GUILD_ID not found"); process.exit(1); }
      guilds = [g];
      console.log(`Targeting guild: ${g.name} (${g.id})`);
    }

    const insertMessage = (guildId: string) => {
      const db = getGuildDb(guildId);
      const stmt = db.prepare("INSERT OR IGNORE INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)");
      return (msg: { id: string; channel_id: string; author_id: string; content: string; created_at: number }) => stmt.run(msg.id, msg.channel_id, msg.author_id, msg.content, msg.created_at);
    };

    for (const guild of guilds) {
      console.log(`\n── ${guild.name} (${guild.id}) ──`);

      const db = getGuildDb(guild.id);
      const progressFile = `db/${guild.id}/backfill.json`;
      const progressAdapter = new JSONFile<BackfillProgress>(progressFile);
      const progressDb = new Low<BackfillProgress>(progressAdapter, { channels: {} });
      await progressDb.read();

      const insert = insertMessage(guild.id);

      // ── Members ──

      if (!progressDb.data.membersScanned) {
        console.log("  Members: fetching...");
        await sleep(1000);
        try {
          const members = await guild.members.fetch();
          const upsert = db.prepare(`INSERT INTO members (id, username, display_name, avatar_url, discord_join_date, guild_join_date, top_role, is_bot, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name, avatar_url=excluded.avatar_url, top_role=excluded.top_role, updated_at=excluded.updated_at`);
          const now = new Date().toISOString();
          for (const [, member] of members) {
            upsert.run(member.id, member.user.username, member.displayName, member.displayAvatarURL({ size: 64 }), member.user.createdAt.toISOString(), member.joinedAt?.toISOString() ?? null, member.roles.highest.name, member.user.bot ? 1 : 0, now);
          }
          console.log(`  Members: ${members.size}`);
          progressDb.data.membersScanned = true;
          await progressDb.write();
        } catch (err) {
          console.error(`  Member fetch failed, will retry next run: ${err}`);
        }

        console.log("  Waiting 45s for member list rate limit cooldown...");
        await sleep(45_000);
      } else {
        console.log("  Members: already scanned (skip)");
      }

      // ── Channels ──

      const channels = guild.channels.cache.filter(
        (ch): ch is TextChannel => ch.isTextBased() && ch.viewable
      );
      console.log(`  Channels: ${channels.size} total`);

      const insertMany = db.transaction((msgs: { id: string; channel_id: string; author_id: string; content: string; created_at: number }[]) => {
        for (const m of msgs) insert(m);
      });

      let totalScanned = 0;
      let skipped = 0;

      for (const [, channel] of channels) {
        const prog = progressDb.data.channels[channel.id];

        if (prog?.complete) {
          skipped++;
          continue;
        }

        try {
          console.log(`  #${channel.name}...`);
          let before: string | undefined = prog?.lastMessageId;

          while (true) {
            const messages = await channel.messages.fetch({ limit: 100, before });
            if (messages.size === 0) break;

            const batch: { id: string; channel_id: string; author_id: string; content: string; created_at: number }[] = [];
            for (const [, msg] of messages) {
              if (msg.author.bot) continue;
              batch.push({ id: msg.id, channel_id: channel.id, author_id: msg.author.id, content: msg.content || '[no text content]', created_at: msg.createdTimestamp });
            }

            if (batch.length > 0) insertMany(batch);
            totalScanned += batch.length;

            if (messages.size < 100) break;
            before = messages.last()?.id;

            if (totalScanned % 500 === 0) {
              progressDb.data.channels[channel.id] = { lastMessageId: before };
              await progressDb.write();
            }

            await sleep(1200);
          }

          progressDb.data.channels[channel.id] = { complete: true };
          await progressDb.write();
          await sleep(1500);
        } catch {
          // skip inaccessible channels
        }
      }

      const msgCount = db.prepare("SELECT COUNT(*) as c FROM messages").get() as { c: number };
      console.log(`  Scanned: ${totalScanned} messages, skipped ${skipped} already-complete channels`);
      console.log(`  Total in DB: ${msgCount.c}`);
    }

    console.log("\nBackfill complete.");
    client.destroy();
    process.exit(0);
  });

  await client.login(config.token);
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
