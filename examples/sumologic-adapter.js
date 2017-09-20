
var HTTPS_URL = 'https://endpoint2.collection.us2.sumologic.com/receiver/v1/http/' + process.env.ACCESS_TOKEN;

function forward(container, json) {
  request(HTTPS_URL, {
    data: json,
    headers: {
      'X-Sumo-Name': container.name,
    }
  })
}

exports.sendStats = exports.sendLogs = forward;

