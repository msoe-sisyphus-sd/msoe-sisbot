#!/usr/bin/env bash

cd /home/pi/sisbot-server/
mkdir backup.0
cp -rf sisbot backup/
cp -rf siscloud backup/
cp -rf sisproxy backup/
mv backup.0 backup

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

echo "Upgrade completed"

# sudo killall node
# cd /home/pi/sisbot-server/sisproxy && sudo NODE_ENV=sisbot node server.js &
