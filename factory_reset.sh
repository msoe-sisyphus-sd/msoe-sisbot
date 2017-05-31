#!/usr/bin/env bash

#kill node processes
ps aux | grep " server.js" | grep -v grep
nodepids=$(ps aux | grep " server.js" | grep -v grep | cut -c10-15)
#echo "OK, so we will stop these process/es now..."
for nodepid in ${nodepids[@]}
do
echo "Stopping PID :"$nodepid >> restart.log
sudo kill -9 $nodepid
done

cd /home/pi/sisbot-server/backup/
cp -rf siscloud ../
cp -rf sisbot ../
cp -rf sisproxy ../

cd /home/pi/sisbot-server/sisproxy
sudo NODE_ENV=sisbot node server.js &
echo "Factory Reset complete"
