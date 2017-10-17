var express = require('express')
var config = require('./config/index')
var compression = require('compression')
var history = require('connect-history-api-fallback')
var https = require('https')
var fs = require('fs')
var privatekey = fs.readFileSync('./private.pem', 'utf8')
var certificate = fs.readFileSync('./file.crt', 'utf8')
var credentials = {key: privatekey, cert: certificate}

var app = express()
var httpsServer = https.createServer(credentials, app)
app.use(history())
app.use(compression())
app.use(express.static('./dist'))

var port = process.env.port || config.build.port

module.export = httpsServer.listen(port, function (err) {
  if (err) {
    console.log(err)
    return
  }
  console.log('Listening at http://localhost:' + port + '\n')
})
