#!/usr/bin/env bash

#stop existing led_main if running
ps aux | grep " led_main.py" | grep -v grep
pypids=$(ps aux | grep " led_main.py" | grep -v grep | cut -c10-15)
echo "OK, so we will stop these process/es now..."
for pypid in ${pypids[@]}
do
echo "Stopping PID :"$pypid
sudo kill -9 $pypid
done

cd /home/pi/sisbot-server/sisbot/content/lights
python led_main.py "$@" >> /var/log/sisyphus/lights.log
