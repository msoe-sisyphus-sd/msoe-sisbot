#!/usr/bin/env bash

cd /home/pi/sisbot-server/sisbot
git reset --hard
git pull origin master
npm install

cd /home/pi/sisbot-server/siscloud
git reset --hard
git pull origin master
npm install

cd /home/pi/sisbot-server/sisproxy
git reset --hard
git pull origin master
npm install

sudo killall node
cd /home/pi/sisbot-server/sisproxy && sudo NODE_ENV=sisbot node server.js &
