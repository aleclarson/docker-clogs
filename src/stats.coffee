
exports.start = ->

  containers.on "start", (container) ->
    update = -> fetchStats container
    update()
    intervals[container.id] =
      setInterval update, STATS_INTERVAL * 1000

  containers.on "die", (container) ->
    clearInterval intervals[container.id]
    delete intervals[container.id]

#
# Internal
#

intervals = Object.create null
deletedStats = "read preread pids_stats num_procs storage_stats precpu_stats id name".split " "

fetchStats = (container) ->
  request "/containers/#{container.id}/stats",
    socket: "/docker.sock"
    query: {stream: false}

  .then (res) ->
    stats = res.json
    stats.time = new Date
    for key in deletedStats
      delete stats[key]

    unless /true|stats/.test QUIET
      console.log container.name + " => " + JSON.stringify stats

    if typeof adapter isnt "undefined"
      return adapter.sendStats container, stats, request

    if HTTPS_URL
      return request HTTPS_URL, {data: stats}
