
global.DEBUG = process.env.DEBUG is "true"
global.QUIET = process.env.QUIET or "true"
global.HTTPS_URL = process.env.HTTPS_URL

if HTTPS_URL and not /^https:\/\//.test HTTPS_URL
  console.error "HTTPS_URL must begin with https://"
  process.exit()

fs = require "fsx"
if fs.isFile "/adapter.js"
  DEBUG and console.log "Detected /adapter.js"
  global.adapter = require "/adapter"

# Shutdown if no adapter or HTTPS_URL (and not in DEBUG mode)
else unless HTTPS_URL or DEBUG
  console.warn "Must mount /adapter.js or define HTTPS_URL environment variable!"
  process.exit 1

global.request = require "./request"
global.containers = require("./containers").start()

require("./logs").start()

global.STATS_INTERVAL = Number process.env.STATS_INTERVAL or 60
require("./stats").start() if STATS_INTERVAL > 0
