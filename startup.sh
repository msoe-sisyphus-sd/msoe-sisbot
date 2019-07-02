#!/usr/bin/env bash

# check for wifi adapters plugged in
/home/pi/sisbot-server/sisbot/wifi_adapter_check.sh

start_time="$(date -u +%s)"

cd /home/pi/sisbot-server/sisproxy && git reset --hard
{
  sudo NODE_ENV=sisbot node server.js >> /var/log/sisyphus/proxy.log  2>&1
} || {
  end_time="$(date -u +%s)"
  elapsed="$(($end_time-$start_time))"
  echo "Test failure"
  echo "$elapsed"
  if [ $elapsed -lt 3 ]; then
    echo "Proxy crashed"

    echo "Make sure we are connected to internet"
    RETRIES=0
    FAILED=false
    while ! ping -c 1 -W 2 google.com ; do
      sleep 1
  		RETRIES=RETRIES+1
      if [ "$RETRIES" > "25" ] ; then
      	FAILED=true
      fi
    done

    if [ "$FAILED" = false ] ; then
      echo "Failure! Unable to connect to network, please retry."
      return 1
    else
      sudo -u pi npm install
      sleep 5
      ./restart.sh &
    fi
  else
    echo "Normal stop"
  fi
}
