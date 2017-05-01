import Promise from 'bluebird'
import content from './content'

// Returns an objects with four keys, each of which is an array of
// tracks. Each array has paths of a different type of path shape.
let sortTracksByType = (tracks) => {
  let tracksByType = {
    r00: [],
    r01: [],
    r10: [],
    r11: [],
  }

  for (let track of tracks) {
    tracksByType[track.type].push(track)
  }

  return tracksByType
}

// Given a track type, return an array of path shapes that could be
// drawn next.
let nextAllowableTypes = (trackType) => {
  switch (trackType) {
    case 'r11':
    case 'r01':
      return ['r11', 'r01', 'r10']

    case 'r00':
    case 'r10':
    default:
      return ['r00', 'r01', 'r10']
  }
}

// Get a random track that can be any of the requested shape types.
// Once found, remove the track from `tracksByType` so it can't be
// found again.
let getRandomTrack = (tracksByType, types) => {
  let tracks = []

  // Assemble the array of tracks that match the query.
  for (let type of types) {
    for (let track of tracksByType[type]) {
      tracks.push(track)
    }
  }

  // Pick a random one.
  if (tracks.length == 0) { return null }
  let rnd = Math.random()
  // console.log(rnd)
  let trackIndex = Math.floor(rnd * tracks.length)
  let track = tracks[trackIndex]

  // Remove the plucked one
  let indexToRemove = tracksByType[track.type].indexOf(track)
  tracksByType[track.type].splice(indexToRemove, 1)

  // return the plucked track
  return track
}

// Return the type of track as a string `rxx` where each `x` is either
// 1 or 0, depending on the radius value of the paths start and end
// positions.
let typeOfTrack = (track) => {
  let firstR = track.verts[0].r
  let lastR  = track.verts[track.verts.length - 1].r

  if (firstR == 0 && lastR == 0) {
    return 'r00'
  } else if (firstR == 0 && lastR == 1) {
    return 'r01'
  } else if (firstR == 1 && lastR == 0) {
    return 'r10'
  } else if (firstR == 1 && lastR == 1) {
    return 'r11'
  } else {
    console.error(track.name, 'does not not start and end at zero or one')
  }
}

// Reverses a track, and reassigns all relevant meta data.
let reverseTrack = (track) => {
  if (track.reversible) {
    track.verts = track.verts.reverse()
    track.type = typeOfTrack(track)
    track.reversed = !track.reversed

    let temp = track.lastR
    track.lastR = track.firstR
    track.firstR = temp

    return track
  } else {
    console.error('Cannot revserse track', track)
  }
}

// Conformally shuffle tracks, reversing as needed. This may drop some tracks
// from the playlist if conformality cannot be assured.
let shuffleTracks = (tracks) => {
  let result = []

  let tracksByType = sortTracksByType(tracks)
  let previousTrack

  for (let track in tracks) {
    let types = nextAllowableTypes(previousTrack && previousTrack.type)
    let nextTrack = getRandomTrack(tracksByType, types)

    if (nextTrack) {
      // Reverse the track if it doesn't fit.
      let prevR = (previousTrack && previousTrack.lastR) || 0
      let nextR = nextTrack.firstR
      if (prevR != nextR) {
        reverseTrack(nextTrack)
      }
      // Add the random track to the list.
      result.push(nextTrack)
      previousTrack = nextTrack
    } else {
      // Cut the playlist short. There are no more valid tracks from
      // this position.
      break
    }
  }

  return result
}

// Given a sequential playlist, traverse it an reverse or prune any tracks
// that break conformality.
const conformalize = (tracks) => {
  const result = []

  let previousTrack
  for (let nextTrack of tracks) {
    let types = nextAllowableTypes(previousTrack && previousTrack.type)

    if (types.includes(nextTrack.type)) {
      // If we are on the first track, reverse it if it does not start at zero.
      if (!previousTrack) {
        if (nextTrack.reversible && nextTrack.firstR > 0) {
          nextTrack = reverseTrack(nextTrack)
        }
      } else if (previousTrack.lastR != nextTrack.firstR) {
        nextTrack = reverseTrack(nextTrack)
      }

    // The track will not fit, skip it.
    } else {
      continue
    }

    // This track is now the previous track.
    result.push(nextTrack)
    previousTrack = nextTrack
  }

  return result
}

// This class represents a playlist. It orders tracks defined within it,
// and keeps tabs on what's playing and what's next.
export default class Playlist {

  constructor(name, options = {}) {
    this.name         = name
    this.tracks       = []
    this.currentIndex = -1
    this.shuffle      = !!options.shuffle
    this.repeat       = !!options.repeat
  }

  // Load the playlist instance up with track data, and return when done.
  async loadTracksAsync() {
    const playlistData = await content.getPlaylistDataAsync(this.name)
    this.tracks = []

    for (let track of playlistData) {

      // Save vertices and the the start and end points of the path.
      track.verts = await content.getTrackDataAsync(track.name)
      track.firstR = track.verts[0].r
      track.lastR  = track.verts[track.verts.length - 1].r

      // Add some meta data about the path shape.
      track.type = typeOfTrack(track)
      track.reversible = track.type == 'r01' || track.type == 'r10'
      track.reversed = false

      // Add the track.
      this.tracks.push(track)
    }

    // Shuffle conformally
    if (this.shuffle) {
      this.tracks = shuffleTracks(this.tracks)

    // Sequential playlist should merely ensure conformality without
    // changing the order of the list, if possible.
    } else {
      this.tracks = conformalize(this.tracks)
    }
  }

  // Get the track object that is currently playing.
  get currentTrack() {
    const track = this.tracks[this.currentIndex]
    return track || null
  }

  // Advance to the next track, and return that track.
  async nextTrack() {
    this.currentIndex++

    // If this playlist repeats, then start over.
    if (this.repeat && this.currentIndex >= this.tracks.length) {
      await this.loadTracksAsync()
      this.currentIndex = 0
    }

    return this.currentTrack
  }
}
