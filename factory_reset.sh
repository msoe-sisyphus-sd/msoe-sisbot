#!/usr/bin/env bash

# kill running node processes
ps aux | grep " server.js" | grep -v grep
nodepids=$(ps aux | grep " server.js" | grep -v grep | cut -c10-15)
#echo "OK, so we will stop these process/es now..."
for nodepid in ${nodepids[@]}
do
echo "Stopping PID :"$nodepid >> restart.log
sudo kill -9 $nodepid
done

# remove log folder
#cd /var/log/
#sudo rm -rf sisyphus

# remove status
cd /home/pi/sisbot-server/sisbot/content/
rm status.json

#reset rc.local
#sudo echo -e "#!/bin/sh -e\ncd /home/pi/sisbot-server/sisproxy && NODE_ENV=sisbot node server.js &\nexit 0\n" > /etc/rc.local

# reset sisbot
cd /home/pi/sisbot-server/sisbot
git reset --hard fc4e8901bed70c906807b62c22b4b3a9c52b7d06

# reset siscloud
cd /home/pi/sisbot-server/siscloud
git reset --hard 7aa47893759f44ff30f357937e23e27e0cb9df59

# reset sisproxy
cd /home/pi/sisbot-server/sisproxy
git reset --hard 30197f736b75830ad57e15b898766cd4e41dc9ae

# reset hostname
cd /home/pi/sisbot-server/sisbot
sudo ./set_hostname.sh Sisyphus

# reset to hotspot
sudo ./start_hotspot.sh

echo "Factory Reset complete"

sudo reboot
