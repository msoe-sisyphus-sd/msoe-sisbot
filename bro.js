var https = require("https");
var tls   = require("tls");
var fs    = require("fs");
var express = require("express");
var cors   = require("cors");

var app = express();

app.use(cors());
app.post("*", function(req, res) {
	console.log("Post:",req.originalUrl, req.body);
  res.send("hello world");
});
app.get("*", function(req, res) {
	console.log("Get:",req.originalUrl, req.body);
  res.send("hello world 2");
});

https.createServer({
  key  : fs.readFileSync("/home/pi/sisbot-server/certs/raspberrypi.local/test.key"),
  cert : fs.readFileSync("/home/pi/sisbot-server/certs/raspberrypi.local/test.crt"),
}, app).listen(1347);

console.log("WE ARE STARTING");
