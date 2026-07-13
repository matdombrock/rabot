import type {
  ChatInputCommandInteraction,
  Client,
  Events,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

export interface Command {
  name: string;
  description: string;
  json: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventExecutor = (...args: any[]) => Promise<void>;

export interface Event {
  name: Events;
  once?: boolean;
  execute: EventExecutor;
}
