// External dependencies.
import fs from 'fs'
import path from 'path'
import CSON from 'cson'

// Report on errors.
process.on('uncaughtException', (err) => {
  console.error(err)
  console.error(err.stack)
  process.exit(1)
})

// Report on failed async promises.
process.on('unhandledRejection', (reason, p) => {
  console.error(`${new Date().toUTCString()}: Unhandled Rejection at: Promise ${p} reason: ${reason}`)
  console.error(reason.stack)
  process.exit(1)
})

// Load the application libraries.
import * as config from './config'
import httpServer from './http-server'
import wsServer from './socket-server'
import Sisbot from './models/sisbot'

// Load sisbot with the specified config.
let sisbotConfig = CSON.load(path.join(
  config.ROOT_PATH,
  'configs',
  `${ process.argv[2] || 'default' }.cson`
))
let sisbot = new Sisbot(sisbotConfig)

// Let 'er rip!
httpServer.start()
wsServer.start(sisbot, httpServer.http)
