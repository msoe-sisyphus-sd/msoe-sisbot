import chalk from 'chalk'
import ws from 'ws'
import Sisbot from './models/sisbot'
import _ from 'lodash'

let sisbot // Holds the current sisbot.

// This command simply need to be passed to the sisbot object, no
// special handling required.
const simpleCommands = [
  'pause',
  'resume',
  'home',
  'jogThetaLeft',
  'jogThetaRight',
  'jogRhoOutward',
  'jogRhoInward',
]

let connections = []

// The `name` key of the payload in each socket request will be matched
// up with a function listed in this object that will handle that request.
const routes = {

  // Calls back with the current state of the machine. One of:
  // - waiting
  // - homing
  // - playing
  getState(data, cb) {
    cb && cb(sisbot.getState())
  },

  // Callsback with an array of playlists, that have a name and track data.
  async getPlaylists(data, cb) {
    const playlistNames = await sisbot.content.getPlaylistNamesAsync()
    const result = []

    for (let name of playlistNames) {
      result.push({
        name: name,
        tracks: await sisbot.content.getPlaylistDataAsync(name),
      })
    }

    cb && cb(result)
  },

  // Calls back with an array of strings, one for each name of a playlist
  // currently installed.
  async getPlaylistNames(data, cb) {
    const names = await sisbot.content.getPlaylistNamesAsync()
    cb && cb(names)
  },

  // Calls back with an array of strings, one for each track name currently
  // installed.
  async getTrackNames(data, cb) {
    const names = await sisbot.content.getTrackNamesAsync()
    cb && cb(names)
  },

  // Play a playlist by a specific name. Expects `data` to be an object with
  // the following keys.
  //
  // - name: the name ofthe playlist to start playing
  // - shuffle: true if you want to randomize the play order
  // - repeat: repeat if you wan thte list to start over when it completes
  playPlaylist(data, cb) {
    console.log(`Starting playlist: ${data.name} shuffle: ${!!data.shuffle} repeat: ${!!data.repeat}`)
    sisbot.playPlaylist(data.name, {
      shuffle: data.shuffle,
      repeat: data.repeat,
    })
    cb && cb(sisbot.playlist)
  },

  // Calls back with track names in a playlist.
  getPlaylist(data, cb) {
    console.log(`Reading and parsing playlist: ${data}`)
    sisbot.getPlaylist(data, cb)
  },

  // Calls back with the playlist object that is currently being played.
  getCurrentPlaylist(data, cb) {
    if (!sisbot.playlist) { return cb && cb(null) }

    // prune the huge verts array from tracks and return the playlist
    let playlist = _.clone(sisbot.playlist)
    playlist.tracks = playlist.tracks.map((track) => _.omit(track, 'verts'))
    cb && cb(playlist)
  },

  // Calls back with current LED brightness.
  getBrightness(data, cb) {
    console.log('getting brightness', sisbot.brightness)
    cb && cb(sisbot.brightness)
  },

  // Sets the brightness value, and then calls back with that new value.
  // Valid values are floats from zero to one.
  setBrightness(data, cb) {
    console.log(`Setting LED brightness to: ${data}`)
    sisbot.brightness = data
    cb && cb(sisbot.brightness)
  },

  // Calls back with the current speed multiplier.
  getSpeed(data, cb) {
    console.log('getting speed', sisbot.speed)
    cb && cb(sisbot.speed)
  },

  // Sets and then calls back with the current speed multiplier.
  setSpeed(data, cb) {
    console.log(`Setting Speed multiplier: ${data}x`)
    sisbot.speed = data
    cb && cb(sisbot.speed)
  },

  // Returns the configuration for the currently connected sisbot.
  getConfig(data, cb) {
    console.log('Getting bot config.')
    cb && cb(sisbot.config)
  },

  // Returns the repeat state of the current playlist
  getRepeat(data, cb) {
    console.log('Getting playlist repeat status.')
    cb && cb(sisbot.repeat)
  },

  setRepeat(data, cb) {
    console.log('Setting playlist repeat status to', data)
    sisbot.repeat = data
    cb && cb(sisbot.repeat)
  },
}

// Add the simple command handlers into the routes.
for (let command of simpleCommands) {
  routes[command] = (data, cb) => {
    console.log(`Executing command: ${command}`)
    sisbot[command]()
    cb && cb()
  }
}

// When a web socket message is received, parse it,
// execute the correct handler, and send any necesary
// callbacks.
let onMessage = (conn, str) => {
  console.log(
    chalk.cyan(" * Received: "),
    chalk.white(str)
  )

  // Parse the payload and find the right handler.
  const payload = JSON.parse(str)
  const route = routes[payload.name]

  // Execute the handler.
  if (route) {
    route(payload.data, (res) => {
      // If the handler calls back, then send the
      // result back to the client.
      const responsePayload = {
        name: `${payload.name}-response`,
        data: res,
      }
      conn.send(JSON.stringify(responsePayload))
    })

  } else {
    console.error('not found: ', payload.name)
  }
}

// Bind event handlers to the new connection.
let onConnect = (conn) => {
  // Save the new connection in the connections array.
  connections.push(conn)

  // Log that a new connection was received and the current connection count.
  console.log(
    chalk.green(' + New WebSocket     '),
    `${connections.length} connections`
  )

  // Process a request from a socket.
  conn.on('message', (str) => {
    onMessage(conn, str)
  })

  // Remove the closed socket form the conenctions array.
  conn.on('close', (code, reason) => {
    connections.splice(connections.indexOf(conn), 1)
    console.log(
      chalk.red(' + Closed WebSocket  '),
      `${connections.length} connections`
    )
  })
}

export default {

  // Export a start method that creates the server,
  // binds setup to the connection event, and saves
  // a reference to the sisbot instance.
  start(sisbotInstance, httpServer) {
    sisbot = sisbotInstance
    let wsServer = new ws.Server({ server: httpServer })
    wsServer.on('connection', onConnect)
  },

  // Export a broadcast method that sends a message to all
  // connected sockets in `{"name": name, "data": data}`
  // format.
  broadcast(name, data) {
    console.log(chalk.magenta(`! Broadcast: ${name} ${JSON.stringify(data)}`))
    for (let conn of connections) {
      conn.send(JSON.stringify({ name, data }))
    }
  },
}
