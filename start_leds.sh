#!/usr/bin/env bash

ps aux | grep " led_main.py" | grep -v grep
pypids=$(ps aux | grep " led_main.py" | grep -v grep | cut -c10-15)
echo "OK, so we will stop these process/es now..."
for pypid in ${pypids[@]}
do
echo "Stopping PID :"$pypid
sudo kill -9 $pypid
done

cd /home/pi/sisbot-server/sisbot/content/lights
if [ -n "$1" ] && [ -n "$2" ]; then
  python led_main.py "$1" "$2"
else
  python led_main.py
fi
