var assertValid, contentTypes, isValid, optionTypes, qs, readStream, request, responseProto, schemeRE, schemes, urlRE;

assertValid = require("assertValid");

isValid = require("isValid");

qs = require("querystring");

urlRE = /([^\/:]+)(:[0-9]+)?(\/.*)?/;

schemeRE = /^[^:]+/;

schemes = {
  http: require("http"),
  https: require("https")
};

contentTypes = {
  binary: "application/octet-stream",
  json: "application/json",
  text: "text/plain; charset=utf-8"
};

optionTypes = {
  method: "string?",
  headers: "object?",
  query: "string|object?",
  data: "string|object|buffer?",
  contentType: "string?",
  stream: "boolean?",
  socket: "string?"
};

request = function(url, options) {
  var config, contentType, data, headers, method, parts, query, scheme, stream;
  if (options == null) {
    options = {};
  }
  assertValid(url, "string");
  assertValid(options, optionTypes);
  method = options.method;
  headers = options.headers || {};
  if (headers["Accept"] == null) {
    headers["Accept"] = "*/*";
  }
  if (query = options.query) {
    if (isValid(query, "object")) {
      query = qs.stringify(query);
    }
    if (query) {
      query = "?" + query;
    }
  } else {
    query = "";
  }
  if (data = options.data) {
    contentType = headers["Content-Type"];
    if (options.contentType) {
      contentType = contentTypes[options.contentType];
    }
    if (isValid(data, "object")) {
      data = JSON.stringify(data);
      if (contentType == null) {
        contentType = contentTypes.json;
      }
    } else if (Buffer.isBuffer(data)) {
      if (contentType == null) {
        contentType = contentTypes.binary;
      }
    } else {
      if (contentType == null) {
        contentType = contentTypes.text;
      }
    }
    if (method == null) {
      method = "POST";
    }
    headers["Content-Type"] = contentType;
    headers["Content-Length"] = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
  }
  config = {
    method: method,
    headers: headers
  };
  if (options.socket) {
    scheme = "http";
    config.socketPath = options.socket;
    config.path = url + query;
  } else {
    scheme = schemeRE.exec(url)[0];
    if (!schemes.hasOwnProperty(scheme)) {
      throw Error("Unsupported scheme: '" + scheme + "'");
    }
    parts = urlRE.exec(url.slice(scheme.length + 3));
    if (!options.socket) {
      config.host = parts[1];
    }
    if (parts[2]) {
      config.port = Number(parts[2].slice(1));
    }
    config.path = (parts[3] || "/") + query;
  }
  if (scheme === "https") {
    if (options.ssl) {
      Object.assign(config, options.ssl);
    } else {
      config.rejectUnauthorized = false;
    }
  }
  stream = options.stream === true;
  return new Promise(function(resolve, reject) {
    var onResponse, req;
    onResponse = stream ? resolve : function(res) {
      var status;
      status = res.statusCode;
      return readStream(res, function(error, data) {
        if (error) {
          return reject(error);
        } else {
          return resolve({
            __proto__: responseProto,
            success: status >= 200 && status < 300,
            headers: res.headers,
            status: status,
            data: data
          });
        }
      });
    };
    req = schemes[scheme].request(config, onResponse);
    if (data) {
      req.write(data);
    }
    return req.end();
  });
};

module.exports = request;

readStream = function(stream, callback) {
  var chunks;
  chunks = [];
  stream.on("data", function(chunk) {
    return chunks.push(chunk);
  });
  stream.on("end", function() {
    return callback(null, Buffer.concat(chunks));
  });
  return stream.on("error", callback);
};

responseProto = (function() {
  var proto;
  proto = {};
  Object.defineProperty(proto, "json", {
    get: function() {
      return JSON.parse(this.data.toString());
    },
    set: function() {
      throw Error("Cannot set `json`");
    }
  });
  Object.defineProperty(proto, "text", {
    get: function() {
      return this.data.toString();
    },
    set: function() {
      throw Error("Cannot set `text`");
    }
  });
  return proto;
})();
