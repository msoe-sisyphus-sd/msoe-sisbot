#!/usr/bin/env bash

# check for wifi adapters plugged in
if [ -f "/home/pi/sisbot-server/sisbot/wifi_adapter_check.sh" ]; then
  /home/pi/sisbot-server/sisbot/wifi_adapter_check.sh
fi

check_internet () {
  echo "Make sure we are connected to internet"
  RETRIES=0
  FAILED=false
  while ! ping -c 1 -W 2 google.com ; do
    sleep 1
    let "RETRIES++"
    if [ $RETRIES -gt 25 ] ; then
      FAILED=true
      break
    fi
  done

  echo "Retries $RETRIES, Failed $FAILED"

  if [ "$FAILED" = true ] ; then
    echo "Failure! Unable to connect to network, please retry."
    return 0
  else
    return 1
  fi
}

# fix USB npm compile issue
PKG_LIBUDEV_V="$(dpkg -l libudev-dev 2>&1)"
if [[ $PKG_LIBUDEV_V == "dpkg-query: no packages found matching libudev-dev"* ]]; then
  echo "No libudev package found"
  IS_CONNECTED=$(check_internet)

  if [ "$IS_CONNECTED" = 0 ] ; then
    echo "Failure! Unable to connect to network, please retry."
  else
    apt-get install -yq libudev-dev
  fi
fi

# check for node_modules in each folder
cd /home/pi/sisbot-server/sisbot
if [ -d "node_modules" ]; then
  echo "Sisbot node_modules found"
else
  echo "Sisbot node_modules missing"
  IS_CONNECTED=$(check_internet)

  if [ "$IS_CONNECTED" = 0 ] ; then
    echo "Failure! Unable to connect to network, please retry."
  else
    sudo -u pi npm install
  fi
fi
cd /home/pi/sisbot-server/siscloud
if [ -d "node_modules" ]; then
  echo "Siscloud node_modules found"
else
  echo "Siscloud node_modules missing"
  IS_CONNECTED=$(check_internet)

  if [ "$IS_CONNECTED" = 0 ] ; then
    echo "Failure! Unable to connect to network, please retry."
  else
    sudo -u pi npm install
  fi
fi
cd /home/pi/sisbot-server/sisproxy && git reset --hard
if [ -d "node_modules" ]; then
  echo "Sisproxy node_modules found"
else
  echo "Sisproxy node_modules missing"
  IS_CONNECTED=$(check_internet)

  if [ "$IS_CONNECTED" = 0 ] ; then
    echo "Failure! Unable to connect to network, please retry."
  else
    sudo -u pi npm install
  fi
fi

start_time="$(date -u +%s)"

{
  sudo NODE_ENV=sisbot node server.js >> /var/log/sisyphus/proxy.log  2>&1
} || {
  end_time="$(date -u +%s)"
  elapsed="$(($end_time-$start_time))"
  echo "Test failure"
  echo "$elapsed"
  if [ $elapsed -lt 3 ]; then
    echo "Proxy crashed"

    IS_CONNECTED=$(check_internet)

    if [ "$IS_CONNECTED" = 0 ] ; then
      echo "Failure! Unable to connect to network, please retry."
    else
      rm -rf node_modules
      sudo -u pi npm install
      sleep 5
      ./restart.sh &
    fi
  else
    echo "Normal stop"
  fi
}
