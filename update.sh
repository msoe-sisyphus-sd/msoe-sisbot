#!/usr/bin/env bash

cd /home/pi/sisbot-server/
mkdir -p backup.0
sudo cp -rf sisbot/ backup.0/
sudo cp -rf siscloud/ backup.0/
sudo cp -rf sisproxy/ backup.0/
sudo rm -rf /home/pi/sisbot-server/backup
sudo mv -f /home/pi/sisbot-server/backup.0/ /home/pi/sisbot-server/backup

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
