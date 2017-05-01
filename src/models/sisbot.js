import Promise from 'bluebird'
import { SerialPort } from 'serialport'
Promise.promisifyAll(SerialPort.prototype)

import plotter from './plotter'
import content from './content'
import Playlist from './playlist'

let broadcast

export default class Sisbot {
  constructor(config) {
    broadcast = require('../socket-server').default.broadcast

    this.config = config
    this.plotter = plotter
    this.content = content
    this._brightness = 0.8
    this.homed = false

    // Stores the active playlist.
    this.playlist = null

    plotter.setConfig(config)
    this.connect()

    plotter.onFinishTrack(() => this.playNextTrack())
    plotter.onStateChanged((newState, oldState) => this.handleStateChanged(newState, oldState))

    this.onStateChanged = (oldState, newState) => {}
  }

  // Broadcast the state change and then fire the handler.
  handleStateChanged(newState, oldState) {
    broadcast('didChangeState', { newState, oldState })
    this.onStateChanged(newState, oldState)
  }

  // Execute a serial command, and log it to the console.
  serialWrite(command) {
    console.info(`SERIAL: ${command}`)
    this.serial.write(`${command}\r`)
  }

  // Double check we have an open serial connection.
  // Add `if (!this.validateConnection()) { return }` to any function
  // that requires a serial connection.
  validateConnection() {
    if (!this.serial || !this.serial.isOpen()) {
      console.error('No serial connection')
      return false
    }
    return true
  }

  // Connects to a serial port. Async return of `true` on success.
  async connect() {
    if (this.serial && this.serial.isOpen()) { return true }

    console.info(`connect: to serial port ${this.config.serialPath}`)
    this.serial = new SerialPort(this.config.serialPath, {}, false)

    try {
      await this.serial.openAsync()
      console.info(`connect: connected!`)
      plotter.useSerial(this.serial)

      if (this.config.autoplay) {
        this.playPlaylist('default', {
          shuffle: true,
          repeat: true,
        })
      }

      return true

    } catch(e) {
      console.error(`connect: ${e}`)
      return false
    }
  }

  // Basic controls
  getState() {
    return plotter.getState()
  }

  pause()               {
    if (!this.validateConnection()) return
    plotter.pause()
    broadcast('didPause')
  }

  resume() {
    if (!this.validateConnection()) return
    plotter.resume()
    broadcast('didResume')
  }

  home() {
    this.validateConnection() && plotter.home()
  }

  // Play a playlist!
  async playPlaylist(name, options = {}) {

    // If already playing, then pause, wait for the complete pause, and
    // then try again.
    if (plotter.getState() === 'playing') {
      broadcast('didAbortPlaylist', this.playlist.name)

      this.pause()
      this.onStateChanged = (newState) => {
        if (newState === 'waiting') {
          this.playPlaylist(name, options)
        }
      }
      return
    }

    this.homed = false
    this.playlist = new Playlist(name, options)
    await this.playlist.loadTracksAsync()

    console.log('Prepared Playlist:')
    for (let track of this.playlist.tracks) {
      console.log(` - ${track.name}\t${track.type}\t${track.reversed ? 'reverse' : 'normal '}`)
    }

    broadcast('didBeginPlaylist', this.playlist.name)

    this.playNextTrack()
  }

  // Play the next track in the current playlist.
  async playNextTrack() {
    // Already homed, so play the next track
    if (this.homed) {
      const nextTrack = await this.playlist.nextTrack()
      if (nextTrack) {
        console.log(`Next Track: ${nextTrack.name}`)
        broadcast('didBeginTrack', nextTrack.name)
        plotter.playTrack(nextTrack)
      } else {
        console.log(`End of playlist: ${this.playlist.name}`)
        broadcast('didFinishPlaylist', this.playlist.name)
      }

    // Home first
    } else {
      console.log('Homing... Will start playlist shortly.');

      // Setup an action to play the first track when homing is completed.
      this.onStateChanged = (newState, oldState) => {
        if (oldState === 'homing') {
          this.homed = true
          this.playNextTrack()
          this.onStateChanged = () => {}
        }
      }

      this.home()
    }
  }

  // Get and play content
  getTrackNames(cb)     { content.getTrackNames(cb) }
  getPlaylistNames(cb)  { content.getPlaylistNames(cb) }
  getPlaylist(name, cb) { content.getPlaylistData(name, cb) }


  playTrack(name)       {
    content.getTrackData(name, (err, trackData) => {
      // if (!this.validateConnection()) { return }
      plotter.playTrack(trackData, 1, 1, 1)
    })
  }

  // Jog functions
  jogThetaLeft()        { this.validateConnection() && plotter.jogThetaLeft() }
  jogThetaRight()       { this.validateConnection() && plotter.jogThetaRight() }
  jogRhoOutward()       { this.validateConnection() && plotter.jogRhoOutward() }
  jogRhoInward()        { this.validateConnection() && plotter.jogRhoInward() }

  // Set/get repeat status
  get repeat() {
    return this.playlist && this.playlist.repeat
  }
  set repeat(value) {
    if (this.playlist) {
      this.playlist.repeat = value
      broadcast('didSetRepeat', value)
    }
  }

  // Plotter speed getters/setters
  get speed() {
    return plotter.getSpeed()
  }
  set speed(speed) {
    plotter.setSpeed(speed)
    broadcast('didSetSpeed', speed)
  }

  // Get the current LED brightness.
  get brightness()      { return this._brightness }

  // Set the brightess of the LEDs, from zero to one.
  set brightness(value) {
    console.log('set brightness', value)

    this._brightness = value
    if (value < 0) { brightness = 0 }
    if (value > 1) { brightness = 1 }

    // Don't continue if we're disconnected from the sisbot
    if (!this.validateConnection()) { return }

    // convert to an integer from 0 - 1023, parabolic scale.
    let pwm = Math.pow(2, value * 10) - 1
    pwm = Math.floor(pwm)

    if (pwm == 0) {
      this.serialWrite('SE,0')
    } else {
      this.serialWrite(`SE,1,${pwm}`)
    }

    broadcast('didSetBrightness', value)
  }
}
