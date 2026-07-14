import { Events, type Message } from "discord.js";
import sharp from "sharp";
import type { Event } from "../types.js";
import { getGuildDb } from "../db.js";
import { config } from "../config.js";

async function prepareImageUrl(url: string, isGif: boolean): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const pipeline = sharp(buffer, isGif ? { animated: false } : {}).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 });
  const processed = await pipeline.toBuffer();
  return `data:image/jpeg;base64,${processed.toString("base64")}`;
}

const messageCreateImageDescribe: Event = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guildId!;
    const db = getGuildDb(guildId);

    // Check if AI image describe is enabled for this guild
    const enabledRow = db.prepare("SELECT value FROM config WHERE key = 'aiimagedescribe_enabled'").get() as { value: string } | undefined;
    if (enabledRow?.value !== "true") return;

    if (!config.openrouter.apiKey) return;

    // Find image attachments
    const imageAttachments = message.attachments.filter(a => {
      if (!a.contentType) return false;
      return a.contentType.startsWith("image/");
    });

    // Also check for image URLs in message content
    const imageUrlPattern = /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?/gi;
    const contentUrls = (message.content.match(imageUrlPattern) || []);

    const imageUrls: { url: string; isGif: boolean }[] = [];

    for (const [, att] of imageAttachments) {
      const isGif = att.contentType === "image/gif" || att.url.includes(".gif");
      imageUrls.push({ url: att.url, isGif });
    }
    for (const url of contentUrls) {
      if (!imageUrls.some(i => i.url === url)) {
        imageUrls.push({ url, isGif: url.includes(".gif") });
      }
    }

    if (imageUrls.length === 0) return;

    // React to acknowledge we're processing
    await message.react("🤖").catch(() => {});

    // Process each image (limit to first 4 to avoid abuse)
    const toProcess = imageUrls.slice(0, 4);

    for (const image of toProcess) {
      try {
        const imageUrl = await prepareImageUrl(image.url, image.isGif);

        const timeoutSignal = AbortSignal.timeout(60000);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openrouter.apiKey}`,
            "HTTP-Referer": "https://github.com/your-username/dbot",
          },
          body: JSON.stringify({
            model: config.imageDescribe.model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Describe this image in a few sentences. Be specific about what you see." },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }),
          signal: timeoutSignal,
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("Image describe API error:", errText.slice(0, 200));
          return;
        }

        const data = (await response.json()) as { choices: { message: { content: string } }[] };
        const description = data.choices?.[0]?.message?.content ?? "(no description)";

        const lines = [
          description,
          "",
          "***NOTE: This is an AI driven accessibility feature. Image descriptions may be comically incorrect.***",
        ];
        if (image.isGif) lines.push("", "**NOTE: The AI only saw the first frame of this GIF.**");
        const reply = lines.join("\n");

        if (reply.length <= 2000) {
          await message.reply(reply);
        } else {
          await message.reply(reply.slice(0, 2000));
        }
      } catch (err) {
        console.error("Image describe error:", err, `(model: ${config.imageDescribe.model})`);
        if (err instanceof Error && err.name === "TimeoutError") {
          await message.reply("Image description timed out").catch(() => {});
        }
      }
    }
  },
};

export default messageCreateImageDescribe;
