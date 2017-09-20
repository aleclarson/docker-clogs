
assertValid = require "assertValid"
isValid = require "isValid"
qs = require "querystring"

urlRE = /([^\/:]+)(:[0-9]+)?(\/.*)?/
schemeRE = /^[^:]+/

schemes =
  http: require "http"
  https: require "https"

contentTypes =
  binary: "application/octet-stream"
  json: "application/json"
  text: "text/plain; charset=utf-8"

optionTypes =
  method: "string?"
  headers: "object?"
  query: "string|object?"
  data: "string|object|buffer?"
  contentType: "string?"
  stream: "boolean?"
  socket: "string?"

request = (url, options = {}) ->
  assertValid url, "string"
  assertValid options, optionTypes

  method = options.method # or "GET"
  headers = options.headers or {}
  headers["Accept"] ?= "*/*"

  if query = options.query
    if isValid query, "object"
      query = qs.stringify query
    query = "?" + query if query
  else query = ""

  if data = options.data
    contentType = headers["Content-Type"]

    if options.contentType
      contentType = contentTypes[options.contentType]

    if isValid data, "object"
      data = JSON.stringify data
      contentType ?= contentTypes.json

    else if Buffer.isBuffer data
      contentType ?= contentTypes.binary

    else
      contentType ?= contentTypes.text

    method ?= "POST"
    headers["Content-Type"] = contentType
    headers["Content-Length"] =
      if Buffer.isBuffer data
      then data.length
      else Buffer.byteLength data

  config = {method, headers}

  if options.socket
    scheme = "http"
    config.socketPath = options.socket
    config.path = url + query

  else
    scheme = schemeRE.exec(url)[0]
    unless schemes.hasOwnProperty scheme
      throw Error "Unsupported scheme: '#{scheme}'"

    parts = urlRE.exec url.slice scheme.length + 3
    config.host = parts[1] if !options.socket
    config.port = Number parts[2].slice 1 if parts[2]
    config.path = (parts[3] or "/") + query

  if scheme is "https"
    if options.ssl
    then Object.assign config, options.ssl
    else config.rejectUnauthorized = false

  stream = options.stream is true
  return new Promise (resolve, reject) ->

    onResponse =
      if stream
      then resolve
      else (res) ->
        status = res.statusCode
        readStream res, (error, data) ->
          if error
          then reject error
          else resolve {
            __proto__: responseProto
            success: status >= 200 and status < 300
            headers: res.headers
            status
            data
          }

    req = schemes[scheme].request config, onResponse
    req.write data if data
    req.end()

module.exports = request

#
# Helpers
#

readStream = (stream, callback) ->
  chunks = []

  stream.on "data", (chunk) ->
    chunks.push chunk

  stream.on "end", ->
    callback null, Buffer.concat chunks

  stream.on "error", callback

responseProto = do ->
  proto = {}

  Object.defineProperty proto, "json",
    get: -> JSON.parse @data.toString()
    set: -> throw Error "Cannot set `json`"

  Object.defineProperty proto, "text",
    get: -> @data.toString()
    set: -> throw Error "Cannot set `text`"

  return proto
