import { Events, type Interaction } from "discord.js";
import type { Command, Event } from "../types.js";
import { loadCommands } from "../commands/index.js";
import { getGuildDb } from "../db.js";

const interactionCreate: Event = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    // ── Autocomplete ──
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === "ref" && interaction.guildId) {
        try {
          const db = getGuildDb(interaction.guildId);
          const focused = interaction.options.getFocused();
          const rows = focused
            ? db.prepare("SELECT tag FROM ref_entries WHERE tag LIKE ? ORDER BY tag LIMIT 25").all(`${focused}%`) as { tag: string }[]
            : db.prepare("SELECT tag FROM ref_entries ORDER BY tag LIMIT 25").all() as { tag: string }[];
          await interaction.respond(rows.map(r => ({ name: r.tag, value: r.tag })));
        } catch {
          // Autocomplete responses have a 3s deadline — "Unknown interaction" (10062)
          // means we were too slow. Harmless; the command itself still works.
        }
      }
      return;
    }

    // ── Chat input commands ──
    if (!interaction.isChatInputCommand()) return;

    const commands = await loadCommands();
    const command = commands.get(interaction.commandName);

    if (!command) {
      console.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);
      const reply = { content: "An error occurred while executing this command.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};

export default interactionCreate;
