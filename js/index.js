var fs;

global.DEBUG = process.env.DEBUG === "true";

global.QUIET = process.env.QUIET || "true";

global.HTTPS_URL = process.env.HTTPS_URL;

if (HTTPS_URL && !/^https:\/\//.test(HTTPS_URL)) {
  console.error("HTTPS_URL must begin with https://");
  process.exit();
}

fs = require("fsx");

if (fs.isFile("/adapter.js")) {
  DEBUG && console.log("Detected /adapter.js");
  global.adapter = require("/adapter");
}

global.request = require("./request");

global.containers = require("./containers").start();

require("./logs").start();

global.STATS_INTERVAL = Number(process.env.STATS_INTERVAL || 60);

if (STATS_INTERVAL > 0) {
  require("./stats").start();
}
