
# docker-clogs v1.0.0

`docker-clogs` gathers container logs/stats, and sends them to a logging service via HTTPS.

- Base image of `node:8.5` (great if a NodeJS server exists on the same host)
- Simplest log forwarding solution without vendor lock-in
- Supports an `adapter.js` file for custom routing
- Small amount of cpu/memory/disk usage

### Installation

```sh
# Download and build the `clogs` image.
docker build -t clogs https://github.com/aleclarson/docker-clogs.git

# Create and start the `clogs` container.
docker run -d -v /var/run/docker.sock:/docker.sock --restart=on-failure --log-opt max-size=10m --name=clogs clogs
```

---

### Special behavior

- Stats are fetched via the `/containers/{id}/stats` endpoint of Docker's Engine API.
- All stats are sent as JSON objects with an added `time` property.
- All logs are sent as JSON objects in the form of `{log, time, stream}`, where `stream` can be `stdin`, `stdout`, or `stderr`.
- If a log message is already a JSON object, the `time` and `stream` properties are merged into it.
- Containers with a restart policy are properly supported. The restart time is used to prevent duplicates and never miss a log message.
- Containers events are streamed, which means started/renamed/stopped containers are handled accordingly.
- When a Dokku app is started, no log messages are sent until the container is renamed.
- Intermediate containers created by Dokku are ignored if they die within 100ms.
- Log messages from the `clogs` container are not forwarded.

#### Roadmap

- Ingestion rate limits
- Avoid dropping logs when HTTP requests fail.

---

### Environment variables

The following variables are supported:

#### HTTPS_URL

The endpoint where logs/stats are sent. Must begin with `https://`. The data is sent (via POST request) every 10 seconds for logs, 60 seconds for stats. These intervals can be changed using other environment variables.

If your logging service has stricter requirements, mount an `adapter.js` module when starting the container. Your module must export an object with a `sendStats` function and `sendLogs` function. The `sendStats` function is passed a `container` object and the `stats` object. The `sendLogs` function is passed a `container` object and the `logs` array of objects (will be a string if `LOG_DELIMITER` is undefined or not an empty string).

```sh
-v /path/to/adapter.js:/adapter.js
```

#### LOG_INTERVAL

Seconds to wait before forwarding any unhandled logs again.

For instant forwarding, set this to `0`.

Defaults to `10` seconds.

#### LOG_DELIMITER

The string used as the separator between each buffered log message.

For no delimiter, set this to an empty string. If `/adapter.js` exists, its `sendLogs` method is passed an array of objects. Otherwise, a JSON array is sent to `HTTPS_URL`.

Defaults to `\r`.

#### LOG_STDERR

When `false`, the `stderr` stream is ignored.

Defaults to `true`.

#### STATS_INTERVAL

Seconds to wait before fetching the stats of every container again.

To disable stats monitoring, set this to `0`.

Defaults to `60` seconds.

#### QUIET

When `false`, the logs/stats are printed to stdout before they are forwarded.

You can also silence `logs` or `stats` individually.

Defaults to `true`.

#### DEBUG

When `true`, more verbose logs are printed by the `clogs` process. View them using `docker logs`.

Defaults to undefined.
