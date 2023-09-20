const { TeamSpeak, QueryProtocol, TextMessageTargetMode, TeamSpeakChannel } = require("ts3-nodejs-library");
const http = require("http");

// Environment
const ts3_username = process.env.TS3_USERNAME;
const ts3_password = process.env.TS3_PASSWORD;
const ts3_host = process.env.TS3_HOST;
const ts3_queryport = process.env.TS3_QUERYPORT;
const ts3_serverport = process.env.TS3_SERVERPORT;
const web_serverport = process.env.WEB_SERVERPORT;

// TeamSpeak
const teamspeak = new TeamSpeak({
  host: ts3_host,
  queryport: ts3_queryport,
  serverport: ts3_serverport,
  username: ts3_username,
  password: ts3_password,
  nickname: `ServerQuery (${ts3_username})`
})

let reconnectAttempts = 0;

teamspeak.on("ready", () => {
  console.error("ServerQuery connection established.");
  reconnectAttempts = 0;
})

teamspeak.on("error", async () => { retryConnection() });

async function retryConnection() {
  reconnectAttempts++;
  console.error(`(Attempt ${reconnectAttempts}) Error connecting to TeamSpeak server. Trying again in 60 seconds ...`);
  setTimeout(async () => { try { await teamspeak.reconnect() } catch (reconnectError) {} }, 60000);
}

async function requestServerInfo() {
  const serverInfo = await teamspeak.serverInfo();
  const clientsInfo = await teamspeak.clientList({ clientType: 0 });

  const uptime_seconds = serverInfo.virtualserverUptime;
  const uptime_days = Math.floor(uptime_seconds / (60 * 60 * 24));
  const uptime_remainder_hours = Math.floor((uptime_seconds % (60 * 60 * 24)) / (60 * 60));
  const uptime_remainder_minutes = Math.floor((uptime_seconds % (60 * 60)) / 60);
  const uptime_remainder_seconds = uptime_seconds % 60;

  const formattedDays = uptime_days === 1 ? "day" : "days";
  const formattedHours = uptime_remainder_hours === 1 ? "hour" : "hours";
  const formattedMinutes = uptime_remainder_minutes === 1 ? "minute" : "minutes";
  const formattedSeconds = uptime_remainder_seconds === 1 ? "second" : "seconds";
  const formattedUptime = `${uptime_days} ${formattedDays} ${uptime_remainder_hours} ${formattedHours} ${uptime_remainder_minutes} ${formattedMinutes} ${uptime_remainder_seconds} ${formattedSeconds}`;

  const onlineUsersNicknames = clientsInfo.length > 0 ? clientsInfo.map((clientsInfo) => clientsInfo.nickname).join(", ") : "No users online";

  const customInfo = {
    serverUptimeDays: uptime_days,
    serverUptimeHours: uptime_remainder_hours,
    serverUptimeMinutes: uptime_remainder_minutes,
    serverUptimeSeconds: uptime_remainder_seconds,
    serverUptimeFormatted: formattedUptime,
    serverClientsFormatted: `(${clientsInfo.length}) ${onlineUsersNicknames}`
  };

  return { serverInfo, customInfo };
}

// Webserver
const server = http.createServer(async (req, res) => {
  if (req.url === "/") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(await requestServerInfo()));
  } else {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain");
    res.end("Not Found");
  }
});

server.listen(web_serverport, () => { console.log(`ServerQuery webserver is running on port ${web_serverport}.`) });

// Move everyone to a channel
async function moveUsersToSenderChannel(senderClient, includeClyde) {
  const clients = await teamspeak.clientList({ clientType: 0 });
  const channel = senderClient.cid;

  for (const client of clients) {
    if (client.nickname === "Clyde" && !includeClyde) continue;
    if (client.cid !== channel) await client.move(channel);
  }
}

// Textmessage in global chat event
teamspeak.on("textmessage", async (ev) => {
  if (ev.msg === "tome") {
    const senderClient = await teamspeak.getClientById(ev.invoker);
    await moveUsersToSenderChannel(senderClient, false);
  } else if (ev.msg === "tome -a") {
    const senderClient = await teamspeak.getClientById(ev.invoker);
    await moveUsersToSenderChannel(senderClient, true);
  }
});

const joinedUsers = []; // Used for join sound effects

// Clientconnect event
teamspeak.on("clientconnect", (ev) => {
  if (ev.client.nickname === "Clyde") return;
  joinedUsers.push(ev.client.nickname);
  console.log(`User ${ev.client.nickname} joined the server.`);
});

// Clientmoved event
teamspeak.on("clientmoved", async (ev) => {
  // return if the user didn't join just recently
  if (!joinedUsers.includes(ev.client.nickname)) return;
  console.log(`User ${ev.client.nickname} moved to another channel for the first time since joining.`);

  // remove the user from the just joined list
  joinedUsers.splice(joinedUsers.indexOf(ev.client.nickname), 1);

  const clydeClient = await teamspeak.getClientByName("Clyde");
  const userList = await getChannelDescription("Phil's Crackhaus");

  // return if the user doesn't have a special sound listed
  if (!ev.client.nickname in userList) return;
  const youtubeLink = userList[ev.client.nickname];

  try {
    await teamspeak.sendTextMessage(clydeClient.clid, TextMessageTargetMode.CLIENT, `!play ${youtubeLink}`);
  } catch (error) {
    console.error("Error sending message to Clyde:", error);
  }

  // return if clyde is already in the target channel
  if (clydeClient.cid === ev.channel.cid) return;
  const originChannel = clydeClient.cid;

  // move to user
  await new Promise(resolve => setTimeout(resolve, 4.20 * 1000));
  await teamspeak.clientMove(clydeClient.clid, ev.channel.cid);

  // move back to origin
  await new Promise(resolve => setTimeout(resolve, 15 * 1000));
  await teamspeak.clientMove(clydeClient.clid, originChannel);
});

function parseChannelDescription(description) { // Used for join sound effects
  const userList = {};
  const lines = description.split('\n');

  for (const line of lines) {
    const [user, youtubeLink] = line.split(';');
    if (user && youtubeLink) userList[user.trim()] = youtubeLink.trim();
  }

  return userList;
}

async function getChannelDescription(channel_name) {
  try {
    const channel = await teamspeak.getChannelByName(channel_name);
    const channelInfo = await teamspeak.channelInfo(channel);
    const channelDescription = channelInfo.channelDescription;

    const userList = parseChannelDescription(channelDescription);

    return userList;
  } catch (error) {
    console.error("Error retrieving channel description:", error);
    return [];
  }
}
