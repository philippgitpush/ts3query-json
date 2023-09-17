const { TeamSpeak, QueryProtocol } = require("ts3-nodejs-library");
const http = require("http");

const ts3_username = process.env.TS3_USERNAME;
const ts3_password = process.env.TS3_PASSWORD;
const ts3_host = process.env.TS3_HOST;
const ts3_queryport = process.env.TS3_QUERYPORT;
const ts3_serverport = process.env.TS3_SERVERPORT;
const web_serverport = process.env.WEB_SERVERPORT;

async function getTS3Info() {
  try {
    const teamspeak = await TeamSpeak.connect({
      host: ts3_host,
      queryport: ts3_queryport,
      serverport: ts3_serverport,
      username: ts3_username,
      password: ts3_password,
      nickname: "TS3Query",
    });

    const serverInfo = await teamspeak.serverInfo();
    const clientsInfo = await teamspeak.clientList({ clientType: 0 });
    const customInfo = getCustomInfo(clientsInfo, serverInfo);

    return { serverInfo, customInfo };
  } catch (e) {
    console.error("Error connecting to TeamSpeak server:");
    console.error(e);
    throw e;
  }
}

function getCustomInfo(clientsInfo, serverInfo) {
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
    usersOnlineFormatted: onlineUsersNicknames
  };

  return customInfo;
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/") {
    try {

      const ts3Info = await getTS3Info();
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(ts3Info));

    } catch (e) {

      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain");
      res.end("Error connecting to TeamSpeak server / request limit reached.");

    }
  } else {

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain");
    res.end("Not Found");

  }
});

const port = web_serverport;
server.listen(port, () => {
  console.log(`TS3-Query Webserver is running on port ${port}`);
});
