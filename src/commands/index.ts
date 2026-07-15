import { Collection } from "discord.js";
import type { Command } from "../types.js";

const commands = new Collection<string, Command>();

export async function loadCommands(): Promise<Collection<string, Command>> {
  if (commands.size > 0) return commands;

  const mods = await Promise.all([
    import("./ping.js"),
    import("./info.js"),
    import("./ref.js"),
  ]);

  for (const mod of mods) {
    const cmd = mod.default;
    commands.set(cmd.name, cmd);
  }

  return commands;
}
