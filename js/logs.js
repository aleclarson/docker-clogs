var LOG_DELIMITER, LOG_INTERVAL, LOG_STDERR, defaultSince, ourId, retryStream, sendLogs, streamLogs, streamTypes, streams;

exports.start = function() {
  var createBuffer, flushBuffer;
  createBuffer = function(container) {
    var buffer;
    buffer = [];
    container.push = function(json) {
      return buffer.push(json);
    };
    container.flush = function() {
      if (buffer.length) {
        DEBUG && console.log("(" + container.name + ") Flushing logs...");
        sendLogs(container, buffer);
        buffer = [];
      }
    };
  };
  flushBuffer = function(container) {
    if (LOG_INTERVAL > 0) {
      container.flushTimer = setInterval(container.flush, LOG_INTERVAL * 1000);
    } else {
      container.buffered = false;
    }
    return container.flush();
  };
  containers.on("start", function(container) {
    if (container.id === ourId) {
      return;
    }
    DEBUG && console.log("Creating log stream: " + JSON.stringify(container));
    if (container.dokku || LOG_INTERVAL > 0) {
      container.buffered = true;
      createBuffer(container);
    }
    streamLogs(container);
    if (!container.dokku && LOG_INTERVAL > 0) {
      return flushBuffer(container);
    }
  });
  containers.on("rename", function(container) {
    if (container.dokku) {
      return flushBuffer(container);
    }
  });
  return containers.on("die", function(container) {
    DEBUG && console.log("Destroying log stream: " + container.name);
    if (container.buffered) {
      container.flush();
      if (container.flushTimer) {
        clearInterval(container.flushTimer);
      }
    }
    streams[container.id].destroy();
    return delete streams[container.id];
  });
};

LOG_STDERR = process.env.LOG_STDERR !== "false";

LOG_INTERVAL = Number(process.env.LOG_INTERVAL || 10);

LOG_DELIMITER = process.env.LOG_DELIMITER || "\r";

streams = Object.create(null);

streamTypes = "stdin stdout stderr".split(" ");

defaultSince = Date.now();

ourId = (function() {
  var file, fs;
  fs = require("fsx");
  file = fs.readFile("/proc/1/cgroup").trim();
  return file.slice(file.lastIndexOf("/") + 1);
})();

sendLogs = function(container, logs) {
  if (!/true|logs/.test(QUIET)) {
    logs.forEach(function(json) {
      return console.log(container.name + " => " + JSON.stringify(json));
    });
  }
  if (LOG_DELIMITER) {
    logs = logs.map(JSON.stringify).join(LOG_DELIMITER);
  }
  if (typeof adapter !== "undefined") {
    return adapter.sendLogs(container, logs);
  }
  if (HTTPS_URL) {
    return request(HTTPS_URL, {
      data: logs
    });
  }
};

streamLogs = function(container, since) {
  var containerId;
  if (since == null) {
    since = defaultSince;
  }
  containerId = container.id;
  return request("/containers/" + containerId + "/logs", {
    socket: "/docker.sock",
    stream: true,
    query: {
      timestamps: true,
      follow: true,
      stdout: true,
      stderr: LOG_STDERR,
      since: Math.floor(since / 1000)
    }
  }).then(function(stream) {
    streams[containerId] = stream;
    stream.on("data", function(data) {
      var body, json, time, type;
      time = data.slice(8, 38).toString();
      if (since > new Date(time).getTime()) {
        return;
      }
      type = data[0].toString();
      body = data.slice(38).toString().trim();
      json = body[0] === "{" ? JSON.parse(body) : {
        log: body
      };
      json.time = time;
      json.stream = streamTypes[type];
      if (container.buffered) {
        return container.push(json);
      } else {
        return sendLogs(container, [json]);
      }
    });
    stream.on("end", function() {
      DEBUG && console.log(("(" + container.name + ") Log stream ended: ") + new Date().toISOString());
      if (container.buffered) {
        container.flush();
      }
      return retryStream(container);
    });
    return stream.on("error", function(error) {
      return streamLogs(container, Date.now());
    });
  });
};

retryStream = function(container) {
  return request("/containers/" + container.id + "/json", {
    socket: "/docker.sock"
  }).then(function(res) {
    var state;
    state = res.json.State;
    DEBUG && console.log(("(" + container.name + ") Status: ") + state.Status);
    if (state.Restarting) {
      return setTimeout(retryStream.bind(null, container), 1000);
    }
    if (state.Running) {
      return streamLogs(container, new Date(state.FinishedAt).getTime());
    }
  });
};
