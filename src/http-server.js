import chalk from 'chalk'
import * as config from './config'
import ifconfig from 'wireless-tools/ifconfig'

let app = require('express')()
let http = require('http').Server(app)

app.get('/', (req, res) => {
  res.sendfile('index.html')
})

app.get('/jquery.js', (req, res) => {
  res.sendfile('jquery.js')
})

app.get('/wifi', (req, res) => {
  ifconfig.status('wlan0', (err, status) => {
    res.send({
      isConnected: status && status.up,
      err: err,
      status: status,
    })
  })
})

export default {
  http,
  app,
  start() {
    http.listen(config.PORT, () => {
      console.log(
        chalk.green('👍   HTTP+WebSocket Server live at:'),
        chalk.blue.underline(config.APP_URL)
      )
    })
  },
}
