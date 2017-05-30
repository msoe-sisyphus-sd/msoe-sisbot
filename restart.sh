#!/usr/bin/env bash

sudo killall node
sleep 1
cd /home/pi/sisbot-server/sisproxy && sudo NODE_ENV=sisbot node server.js &

echo "Node restarted"
