#!/usr/bin/env bash

sudo killall node
cd /home/pi/sisbot-server/sisproxy && sudo NODE_ENV=sisbot node server.js &
