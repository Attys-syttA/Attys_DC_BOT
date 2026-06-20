import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { buildLifecycleNotification } from "../bot/lifecycle-notifications.js";

const eventName = process.argv[2];
const token = process.env.DISCORD_BOT_TOKEN;
const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL_ID;

if (!token || !channelId) {
  process.exit(0);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isSendable()) {
      await channel.send(buildLifecycleNotification(eventName));
    }
  } catch {
    process.exitCode = 0;
  } finally {
    client.destroy();
  }
});

try {
  await client.login(token);
} catch {
  process.exit(0);
}
