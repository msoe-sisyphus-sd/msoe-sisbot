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
git pull
npm install

cd /home/pi/sisbot-server/siscloud
git reset --hard
git pull
npm install

cd /home/pi/sisbot-server/sisproxy
git reset --hard
git pull
npm install

cd /home/pi/sisbot-server/
sudo chown -R pi sisbot
sudo chown -R pi siscloud
sudo chown -R pi sisproxy

sudo /home/pi/sisbot-server/sisbot/update_finish.sh

echo "Upgrade completed"

# sudo killall node
# cd /home/pi/sisbot-server/sisproxy && sudo NODE_ENV=sisbot node server.js &
