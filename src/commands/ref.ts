import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { getGuildDb } from "../db.js";

const ref: Command = {
  name: "ref",
  description: "Look up a reference entry by tag, or list all entries",
  json: new SlashCommandBuilder()
    .setName("ref")
    .setDescription("Look up a reference entry by tag, or list all entries")
    .addStringOption(opt =>
      opt.setName("tag").setDescription("The tag to look up").setRequired(false).setAutocomplete(true)
    )
    .toJSON(),
  async execute(interaction) {
    if (!interaction.guildId) { await interaction.reply("This command can only be used in a server."); return; }

    try {
      const db = getGuildDb(interaction.guildId);
      const tag = interaction.options.getString("tag");

      if (!tag) {
        const rows = db.prepare("SELECT tag FROM ref_entries ORDER BY tag").all() as { tag: string }[];
        if (rows.length === 0) { await interaction.reply("No reference entries found."); return; }
        const list = rows.map(r => `\`${r.tag}\``).join(", ");
        await interaction.reply(list);
        return;
      }

      const row = db.prepare("SELECT output FROM ref_entries WHERE tag = ?").get(tag) as { output: string } | undefined;
      if (!row) { await interaction.reply(`Unknown ref: \`${tag}\``); return; }
      await interaction.reply(row.output);
    } catch (err) {
      console.error("[ref] error:", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply("An error occurred.").catch(() => {});
      }
    }
  },
};

export default ref;
