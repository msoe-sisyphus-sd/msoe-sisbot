import fs from 'fs'
import path from 'path'
import Promise from 'bluebird'

let CONTENT_PATH    = './content'
let PLAYLISTS_PATH  = path.join(CONTENT_PATH, 'playlists')
let TRACKS_PATH     = path.join(CONTENT_PATH, 'tracks')

// Callback with an array of filenames that are in directory.
// File extensions will removed.
let getFilenamesWithoutExtension = (dir, cb) => {
  fs.readdir(dir, (err, files) => {
    files = files.map((file) => file.replace(/\..+?$/, ''))
    cb(err, files)
  })
}

// Read a file from and parse it into a two dimensional array.
// Each line is one row of data, and each row is split on whitespace
// for the data columns.
let parseDataFile = (filePath, cb) => {
  fs.readFile(filePath, (err, data) => {
    if (err) { console.error(err) }
    let result = []

    // Step the file, line by line
    let lines = data
      .toString()
      .trim()
      .split('\n')
      .map((line) => line.trim())

    for (let line of lines) {
      line.trim() // Trim all leading/trailing whitespace on the line.
      if (/^#/.test(line))  { continue } // Skip comment lines that being with '#'.
      if (line.length == 0) { continue } // Skip empty lines.
      result.push(line.split(/\s+/)) // split line by any amount of whitespace.
    }

    cb(null, result)
  })
}

export default {

  // Callback with an array of playlist names in the content/playlists directory.
  getPlaylistNames(cb) {
    getFilenamesWithoutExtension(PLAYLISTS_PATH, cb)
  },

  // Callback with an array of track names in the content/tracks directory.
  getTrackNames(cb) {
    getFilenamesWithoutExtension(TRACKS_PATH, cb)
  },

  // Callback with an array of objects for each track in a play list.
  // Each object will have 4 keys: name, vel, accel, thvmax.
  getPlaylistData(name, cb) {
    parseDataFile(path.join(PLAYLISTS_PATH, `${name}.pl`), (err, lines) => {
      let trackDescriptions = lines.map((line) => {
        return {
          name:   line[0].replace(/\..+?$/, ''), // track name, without extension
          vel:    parseFloat(line[1]),
          accel:  parseFloat(line[2]),
          thvmax: parseFloat(line[3]),
        }
      })
      cb(null, trackDescriptions)
    })
  },

  // Callback with an array of objects for each vertex in a track.
  // Each object will have 2 keys: `th` and `r`
  getTrackData(name, cb) {
    parseDataFile(path.join(TRACKS_PATH, `${name}.thr`), (err, lines) => {
      let points = lines.map((line) => {
        return {
          th: parseFloat(line[0]),
          r:  parseFloat(line[1]),
        }
      })
      cb(null, points)
    })
  },
}

Promise.promisifyAll(exports.default)
