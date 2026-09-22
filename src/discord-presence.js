const DiscordRPC = require("discord-rpc");

const CLIENT_ID = "1551659614175764561";
const LOGO_ASSET = "caption_chaos_logo";

const rpc = new DiscordRPC.Client({
  transport: "ipc"
});

let connected = false;

async function connectDiscord() {
  try {
    await rpc.login({
      clientId: CLIENT_ID
    });

    connected = true;

    console.log("[Caption Chaos] Discord Rich Presence connected.");

    await updatePresence({
      details: "Ready to play",
      state: "Caption Chaos"
    });
  } catch (error) {
    connected = false;

    console.log(
      "[Caption Chaos] Discord Rich Presence unavailable."
    );
  }
}

async function updatePresence({
  details = "Playing Caption Chaos",
  state = "In the lobby",
  startTimestamp = Date.now(),
  partySize = 1,
  partyMax = 8
} = {}) {
  if (!connected) return;

  try {
    await rpc.setActivity({
      details,
      state,

      startTimestamp,

      largeImageKey: LOGO_ASSET,
      largeImageText: "Caption Chaos",

      partySize,
      partyMax,

      instance: false
    });
  } catch (error) {
    console.error(
      "[Caption Chaos] Presence update failed:",
      error.message
    );
  }
}

async function clearPresence() {
  if (!connected) return;

  try {
    await rpc.clearActivity();
  } catch {}
}

module.exports = {
  connectDiscord,
  updatePresence,
  clearPresence
};