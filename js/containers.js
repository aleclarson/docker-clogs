var containers, emit, eventId, fetchContainers, i, len, listeners, ref, streamContainerEvents;

exports.start = function() {
  fetchContainers().then(function() {
    return streamContainerEvents(Date.now());
  });
  return this;
};

exports.on = function(eventId, listener) {
  listeners[eventId].push(listener);
};

listeners = Object.create(null);

containers = Object.create(null);

ref = ["start", "rename", "die"];
for (i = 0, len = ref.length; i < len; i++) {
  eventId = ref[i];
  listeners[eventId] = [];
}

emit = function(eventId, container) {
  var j, len1, listener, ref1;
  ref1 = listeners[eventId];
  for (j = 0, len1 = ref1.length; j < len1; j++) {
    listener = ref1[j];
    listener(container);
  }
};

fetchContainers = function() {
  return request("/containers/json", {
    socket: "/docker.sock"
  }).then(function(res) {
    var container, containerId, j, len1, ref1, results;
    ref1 = res.json;
    results = [];
    for (j = 0, len1 = ref1.length; j < len1; j++) {
      container = ref1[j];
      containerId = container.Id;
      if (!containers[containerId]) {
        results.push(emit("start", containers[containerId] = {
          id: containerId,
          name: container.Names[0].slice(1)
        }));
      } else {
        results.push(void 0);
      }
    }
    return results;
  });
};

streamContainerEvents = function(since) {
  return request("/events", {
    socket: "/docker.sock",
    stream: true,
    query: {
      since: Math.floor(since / 1000),
      filters: JSON.stringify({
        type: {
          container: true
        }
      })
    }
  }).then(function(stream) {
    var actions, startDelays;
    actions = {};
    startDelays = {};
    actions.start = function(containerId, attrs) {
      var didStart;
      if (containers[containerId]) {
        return;
      }
      containers[containerId] = {
        id: containerId,
        name: attrs.name,
        dokku: attrs.hasOwnProperty("dokku")
      };
      didStart = function() {
        DEBUG && console.log("Started container: " + attrs.name);
        emit("start", containers[containerId]);
        return delete startDelays[containerId];
      };
      startDelays[containerId] = setTimeout(didStart, 100);
    };
    actions.rename = function(containerId, attrs) {
      var container;
      if (container = containers[containerId]) {
        DEBUG && console.log(("Renamed container: " + (attrs.oldName.slice(1)) + " => ") + attrs.name);
        container.name = attrs.name;
        emit("rename", container);
      }
    };
    actions.die = function(containerId, attrs) {
      if (startDelays.hasOwnProperty(containerId)) {
        clearTimeout(startDelays[containerId]);
        delete startDelays[containerId];
        delete containers[containerId];
        return;
      }
      request("/containers/" + containerId + "/json", {
        socket: "/docker.sock"
      }).then(function(res) {
        if (!res.json.State.Running) {
          DEBUG && console.log("Killed container: " + attrs.name);
          emit("die", containers[containerId]);
          delete containers[containerId];
        }
      });
    };
    stream.on("data", function(data) {
      var event;
      event = JSON.parse(data.toString());
      if (since <= event.timeNano / 1e6) {
        if (actions.hasOwnProperty(event.Action)) {
          return actions[event.Action](event.id, event.Actor.Attributes);
        }
      }
    });
    stream.on("error", function() {
      return streamContainerEvents(Date.now());
    });
  });
};
