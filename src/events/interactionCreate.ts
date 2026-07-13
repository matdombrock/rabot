import { Events, type Interaction } from "discord.js";
import type { Command, Event } from "../types.js";
import { loadCommands } from "../commands/index.js";

const interactionCreate: Event = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
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
