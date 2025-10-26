const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const express = require("express");
const fs = require("fs-extra");
require("dotenv").config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Discord
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// YouTube
const YT_API_KEY = process.env.YT_API_KEY;
const YT_CHANNELS = [
  process.env.YT_CHANNEL1,
  process.env.YT_CHANNEL2,
  process.env.YT_CHANNEL3,
  process.env.YT_CHANNEL4,
  process.env.YT_CHANNEL5
];
const YT_DATA_FILE = "./ytData.json";

// Twitch
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
let twitchToken = process.env.TWITCH_ACCESS_TOKEN;
const TWITCH_STREAMERS = [
  process.env.TWITCH_STREAMER1,
  process.env.TWITCH_STREAMER2
];
const TWITCH_DATA_FILE = "./twitchData.json";

// Interval
const CHECK_INTERVAL = (parseInt(process.env.CHECK_INTERVAL) || 60) * 1000;

// --- Load or init JSON ---
async function loadData(file) {
  try { return await fs.readJson(file); } 
  catch { await fs.writeJson(file, {}); return {}; }
}

// --- YouTube ---
async function fetchLatestYouTubeVideo(channelId) {
  try {
    const res = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: { key: YT_API_KEY, channelId, part: "snippet", order: "date", maxResults: 1 }
    });
    const item = res.data.items?.[0];
    if (!item || item.id.kind !== "youtube#video") return null;
    return { id: item.id.videoId, title: item.snippet.title, url: `https://www.youtube.com/watch?v=${item.id.videoId}` };
  } catch (err) {
    console.error("❌ YouTube error:", err.message);
    return null;
  }
}

async function checkYouTube(ytData) {
  for (const channelId of YT_CHANNELS) {
    const latest = await fetchLatestYouTubeVideo(channelId);
    if (!latest) continue;
    if (ytData[channelId] !== latest.id) {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
      if (channel) await channel.send(`📹 New video from **${channelId}**:\n${latest.url}`);
      ytData[channelId] = latest.id;
    }
  }
  await fs.writeJson(YT_DATA_FILE, ytData, { spaces: 2 });
}

// --- Twitch ---
async function refreshTwitchToken() {
  try {
    const res = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`
    );
    twitchToken = res.data.access_token;
    console.log("✅ Twitch token refreshed");
  } catch (err) {
    console.error("❌ Twitch token error:", err.message);
  }
}

async function checkTwitch(twitchData) {
  if (!twitchToken) await refreshTwitchToken();
  const query = TWITCH_STREAMERS.map(s => `user_login=${s}`).join("&");

  try {
    const res = await axios.get(`https://api.twitch.tv/helix/streams?${query}`, {
      headers: { "Client-ID": TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` }
    });

    const liveStreams = res.data.data;
    for (const streamer of TWITCH_STREAMERS) {
      const stream = liveStreams.find(s => s.user_login.toLowerCase() === streamer.toLowerCase());
      const wasLive = twitchData[streamer] || false;

      if (stream && !wasLive) {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        if (channel) await channel.send(`🔴 **${streamer} is LIVE on Twitch!**\nhttps://www.twitch.tv/${streamer}`);
        twitchData[streamer] = true;
      } else if (!stream && wasLive) {
        twitchData[streamer] = false;
      }
    }
    await fs.writeJson(TWITCH_DATA_FILE, twitchData, { spaces: 2 });
  } catch (err) {
    console.error("❌ Twitch API error:", err.message);
    if (err.response?.status === 401) await refreshTwitchToken();
  }
}

// --- Ready ---
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  let ytData = await loadData(YT_DATA_FILE);
  let twitchData = await loadData(TWITCH_DATA_FILE);

  const checkAll = async () => { await checkYouTube(ytData); await checkTwitch(twitchData); };
  await checkAll();
  setInterval(checkAll, CHECK_INTERVAL);
});

// --- Keepalive ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("Media bot running"));
app.listen(PORT, () => console.log(`🌐 Web server on port ${PORT}`));

client.login(process.env.TOKEN).catch(console.error);
