const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const express = require("express");
const fs = require("fs-extra");
require("dotenv").config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const CHECK_INTERVAL = 60 * 1000; // 1 minute

const DATA_FILE = "./mediaData.json";

// --- Config for YouTube & Twitch ---
const YOUTUBE_CHANNELS = [
  process.env.YT_CHANNEL1,
  process.env.YT_CHANNEL2,
  process.env.YT_CHANNEL3,
  process.env.YT_CHANNEL4,
  process.env.YT_CHANNEL5,
];
const TWITCH_STREAMERS = [
  process.env.TWITCH_STREAMER1,
  process.env.TWITCH_STREAMER2,
];
const YT_API_KEY = process.env.YT_API_KEY;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_ACCESS_TOKEN = process.env.TWITCH_ACCESS_TOKEN;

// --- Load saved data ---
let savedData = { youtube: {}, twitch: {} };
try {
  savedData = fs.readJsonSync(DATA_FILE);
} catch (e) {
  fs.writeJsonSync(DATA_FILE, savedData, { spaces: 2 });
}

// --- YouTube check ---
async function checkYouTube() {
  for (const channelId of YOUTUBE_CHANNELS) {
    try {
      const res = await axios.get(
        "https://www.googleapis.com/youtube/v3/search",
        {
          params: {
            key: YT_API_KEY,
            channelId,
            part: "snippet",
            order: "date",
            maxResults: 1,
          },
        }
      );

      const item = res.data.items?.[0];
      if (!item || item.id.kind !== "youtube#video") continue;

      const videoId = item.id.videoId;
      if (savedData.youtube[channelId] === videoId) continue;

      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
      await channel.send(`New video from <@${channelId}>!\nhttps://www.youtube.com/watch?v=${videoId}`);

      savedData.youtube[channelId] = videoId;
      await fs.writeJson(DATA_FILE, savedData, { spaces: 2 });
    } catch (err) {
      console.error("YouTube error:", err.message);
    }
  }
}

// --- Twitch check ---
async function checkTwitch() {
  try {
    const streamerLogins = TWITCH_STREAMERS.join(",");
    const res = await axios.get("https://api.twitch.tv/helix/streams", {
      params: { user_login: streamerLogins },
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${TWITCH_ACCESS_TOKEN}`,
      },
    });

    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);

    for (const streamer of TWITCH_STREAMERS) {
      const stream = res.data.data.find((s) => s.user_login === streamer);
      if (stream) {
        if (!savedData.twitch[streamer]) {
          await channel.send(`🚨 ${streamer} is live on Twitch! ${stream.title}\nhttps://twitch.tv/${streamer}`);
          savedData.twitch[streamer] = true;
        }
      } else {
        savedData.twitch[streamer] = false;
      }
    }

    await fs.writeJson(DATA_FILE, savedData, { spaces: 2 });
  } catch (err) {
    console.error("Twitch error:", err.message);
  }
}

// --- Start checks ---
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  setInterval(() => {
    checkYouTube();
    checkTwitch();
  }, CHECK_INTERVAL);
  checkYouTube();
  checkTwitch();
});

// --- Keepalive ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("Media bot is running!"));
app.listen(PORT, () =>
  console.log(`🌐 Web server listening on port ${PORT} (pid=${process.pid})`)
);

client.login(process.env.TOKEN).catch(console.error);
