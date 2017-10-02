
exports.start = ->
  fetchContainers().then ->
    streamContainerEvents Date.now()
  return this

exports.on = (eventId, listener) ->
  listeners[eventId].push listener
  return

#
# Internal
#

listeners = Object.create null
containers = Object.create null

for eventId in ["start", "rename", "die"]
  listeners[eventId] = []

emit = (eventId, container) ->
  for listener in listeners[eventId]
    listener container
  return

fetchContainers = ->

  request "/containers/json",
    socket: "/docker.sock"

  .then (res) ->
    for container in res.json
      containerId = container.Id
      unless containers[containerId]
        emit "start", containers[containerId] =
          id: containerId
          name: container.Names[0].slice 1
    DEBUG and console.log "Found containers:\n  " +
      Object.keys containers
        .map (containerId) -> containers[containerId].name + " (#{containerId})"
        .join "\n  "

  .catch (error) ->
    fatal "Failed to fetch containers", error

streamContainerEvents = (since) ->
  # DEBUG and console.log "Streaming container events since: " + new Date(since).toISOString()

  request "/events",
    socket: "/docker.sock"
    stream: true
    query:
      since: Math.floor since / 1000 # Must round to seconds precision 😢
      filters: JSON.stringify
        type: {container: true}

  .then (stream) ->
    actions = {}
    startDelays = {}

    actions.start = (containerId, attrs) ->
      return if containers[containerId]
      containers[containerId] =
        id: containerId
        name: attrs.name
        dokku: attrs.hasOwnProperty "dokku"

      didStart = ->
        DEBUG and console.log "Started container: " + attrs.name
        emit "start", containers[containerId]
        delete startDelays[containerId]

      # Wait before emitting "start", in case this is an intermediate container.
      startDelays[containerId] = setTimeout didStart, 100
      return

    actions.rename = (containerId, attrs) ->
      # The renamed container may not be running.
      if container = containers[containerId]
        DEBUG and console.log "Renamed container: #{attrs.oldName.slice 1} => " + attrs.name
        container.name = attrs.name
        emit "rename", container
      return

    actions.die = (containerId, attrs) ->

      if startDelays.hasOwnProperty containerId
        # DEBUG and console.log "Killed intermediate container: " + attrs.name
        clearTimeout startDelays[containerId]
        delete startDelays[containerId]
        delete containers[containerId]
        return

      request "/containers/#{containerId}/json",
        socket: "/docker.sock"
      .then (res) ->
        unless res.json.State.Running
          DEBUG and console.log "Killed container: " + attrs.name
          emit "die", containers[containerId]
          delete containers[containerId]
        return
      return

    stream.on "data", (data) ->
      event = JSON.parse data.toString()
      if since <= event.timeNano / 1e6
        if actions.hasOwnProperty event.Action
          actions[event.Action] event.id, event.Actor.Attributes
        # else DEBUG and console.log "(#{attrs.name}) Unhandled container event: " + event.Action

    stream.on "error", (error) ->
      DEBUG and console.error "Container event stream failed:\n  " + error.stack.replace /\n/g, "\n  "
      streamContainerEvents Date.now()
    return

  .catch (error) ->
    fatal "Failed to start container event stream", error

fatal = (msg, err) ->
  console.error msg + ":\n  " +
    err.stack.split "\n"
      .slice err.message.split("\n").length
      .join "\n  "
  process.exit()
