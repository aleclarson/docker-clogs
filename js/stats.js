var deletedStats, fetchStats, intervals;

exports.start = function() {
  containers.on("start", function(container) {
    var update;
    update = function() {
      return fetchStats(container);
    };
    update();
    return intervals[container.id] = setInterval(update, STATS_INTERVAL * 1000);
  });
  return containers.on("die", function(container) {
    clearInterval(intervals[container.id]);
    return delete intervals[container.id];
  });
};

intervals = Object.create(null);

deletedStats = "read preread pids_stats num_procs storage_stats precpu_stats id name".split(" ");

fetchStats = function(container) {
  return request("/containers/" + container.id + "/stats", {
    socket: "/docker.sock",
    query: {
      stream: false
    }
  }).then(function(res) {
    var i, key, len, stats;
    stats = res.json;
    stats.time = new Date;
    for (i = 0, len = deletedStats.length; i < len; i++) {
      key = deletedStats[i];
      delete stats[key];
    }
    if (!/true|stats/.test(QUIET)) {
      console.log(container.name + " => " + JSON.stringify(stats));
    }
    if (typeof adapter !== "undefined") {
      return adapter.sendStats(container, stats, request);
    }
    if (HTTPS_URL) {
      return request(HTTPS_URL, {
        data: stats
      });
    }
  })["catch"](function(error) {
    console.error(("(" + container.name + ") Failed to fetch container stats:\n  ") + error.stack.replace(/\n/g, "\n  "));
    throw error;
  });
};
