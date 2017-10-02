
exports.start = ->

  createBuffer = (container) ->
    buffer = []
    container.push = (json) -> buffer.push json
    container.flush = ->
      if buffer.length
        DEBUG and console.log "(#{container.name}) Flushing logs..."
        sendLogs container, buffer
        buffer = []
      return
    return

  flushBuffer = (container) ->
    if LOG_INTERVAL > 0
    then container.flushTimer = setInterval container.flush, LOG_INTERVAL * 1000
    else container.buffered = false
    container.flush()

  containers.on "start", (container) ->
    return if container.id is ourId
    DEBUG and console.log "Creating log stream: " + JSON.stringify container

    if container.dokku or LOG_INTERVAL > 0
      container.buffered = true
      createBuffer container

    streamLogs container
    if !container.dokku and LOG_INTERVAL > 0
      flushBuffer container

  containers.on "rename", (container) ->
    if container.dokku
      flushBuffer container

  containers.on "die", (container) ->
    DEBUG and console.log "Destroying log stream: " + container.name

    if container.buffered
      container.flush()
      if container.flushTimer
        clearInterval container.flushTimer

    streams[container.id].destroy()
    delete streams[container.id]

#
# Internal
#

LOG_STDERR = process.env.LOG_STDERR isnt "false"
LOG_INTERVAL = Number process.env.LOG_INTERVAL or 10
LOG_DELIMITER = process.env.LOG_DELIMITER or "\r"

streams = Object.create null
streamTypes = "stdin stdout stderr".split " "
defaultSince = Date.now()

# Parse the container ID of `docker-clogs`
ourId = do ->
  fs = require "fsx"
  file = fs.readFile("/proc/1/cgroup").trim()
  return file.slice file.lastIndexOf("/") + 1

sendLogs = (container, logs) ->

  unless /true|logs/.test QUIET
    logs.forEach (json) ->
      console.log container.name + " => " + JSON.stringify json

  if LOG_DELIMITER
    logs = logs.map(JSON.stringify).join LOG_DELIMITER

  if typeof adapter isnt "undefined"
    return adapter.sendLogs container, logs

  if HTTPS_URL
    return request HTTPS_URL, {data: logs}

streamLogs = (container, since = defaultSince) ->
  containerId = container.id

  request "/containers/#{containerId}/logs",
    socket: "/docker.sock"
    stream: true
    query:
      timestamps: true
      follow: true
      stdout: true
      stderr: LOG_STDERR
      since: Math.floor since / 1000 # Must round to seconds precision 😢

  .then (stream) ->
    # DEBUG and console.log "(#{container.name}) Streaming logs since: " + new Date(since).toISOString()
    streams[containerId] = stream

    stream.on "data", (data) ->
      date = data.slice(8, 38).toString()
      time = new Date(date).getTime()

      # Errors have no timestamp
      if isNaN time
        container.error = data.toString()
        console.error "(#{container.name}) " + container.error
        return

      # Millisecond precision for `since`
      return if since > time

      type = data[0].toString()
      body = data.slice(38).toString().trim()
      json =
        if body[0] is "{"
        then JSON.parse body
        else {log: body}

      json.time = date
      json.stream = streamTypes[type]

      if container.buffered
      then container.push json
      else sendLogs container, [json]

    stream.on "end", ->
      DEBUG and console.log "(#{container.name}) Log stream ended: " + new Date().toISOString()
      container.flush() if container.buffered
      retryStream container

    stream.on "error", (error) ->
      DEBUG and console.log "(#{container.name}) Log stream failed:\n  " + error.stack.replace /\n/g, "\n  "
      streamLogs container, Date.now()

  .catch (error) ->
    console.error "(#{container.name}) Failed to start log stream:\n  " + error.stack.replace /\n/g, "\n  "
    throw error

retryStream = (container) ->

  request "/containers/#{container.id}/json",
    socket: "/docker.sock"

  .then (res) ->
    state = res.json.State
    DEBUG and console.log "(#{container.name}) Status: " + state.Status

    if state.Restarting
      return setTimeout retryStream.bind(null, container), 1000

    if state.Running
      return streamLogs container, new Date(state.FinishedAt).getTime()

  .catch (error) ->
    console.error "(#{container.name}) Failed to restart log stream:\n  " + error.stack.replace /\n/g, "\n  "
    throw error
