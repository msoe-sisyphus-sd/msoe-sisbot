#!/usr/bin/env bash

# echo current time
echo "Startup: $(date)"

# start LED lights?
if [ -f "/home/pi/sisbot-server/sisbot/content/lights/led_startup.py" ]; then
  cd /home/pi/sisbot-server/sisbot/content/lights/
  python led_startup.py -n 167 & # 167 lights, this may need to be different based on cson
fi
if [ -f "/home/pi/sisbot-server/sisbot/pulse_leds.sh" ]; then
  cd /home/pi/sisbot-server/sisbot/
  ./pulse_leds.sh 2 & # pulse led strip once
fi

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

#SISBOT
cd /home/pi/sisbot-server/sisbot
# check if there are any fatal git errors
OUTPUT=$(git status 2>&1)
if echo "$OUTPUT" | grep -q "fatal:"; then
    echo "Sisbot git fatal error"

    IS_CONNECTED=$(check_internet)

    if [ "$IS_CONNECTED" = 0 ] ; then
      echo "Failure! Unable to connect to network, please retry."
    else
      # move status and tracks out of folder
      if [ -s "content/status.json" ]; then
        mv content/status.json /home/pi/sisbot-server
      fi
      if [ -d "content/tracks" ]; then
        mv content/tracks /home/pi/sisbot-server
      fi

      # move out of folder
      cd /home/pi/sisbot-server

      # remove the folder
      rm -rf sisbot

      # clone the folder back
      git clone pi@webcenter.sisyphus-industries.com:/git/sisbot.git

      # npm install
      cd /home/pi/sisbot-server/sisbot && sudo -u pi npm install

      # move status and tracks back into sisbot
      if [ -s "../status.json" ]; then
        mv ../status.json /home/pi/sisbot-server/sisbot/content
      fi
      if [ -d "../tracks" ]; then
        mv ../tracks /home/pi/sisbot-server/sisbot/content
      fi
    fi
else
  if [ -d "node_modules" ]; then
    echo "Sisbot node_modules found"
  else
    echo "Sisbot node_modules missing"
    IS_CONNECTED=$(check_internet)

    if [ "$IS_CONNECTED" = 0 ] ; then
      echo "Failure! Unable to connect to network, please retry."
    else
      # if package.json doesn't exist or is empty, reset head
      if [ ! -f "package.json" ] || [ ! -s "package.json" ]; then
        echo "Package.json missing/empty, git reset"
        git reset --hard
      fi

      sudo -u pi npm install
    fi
  fi
fi

#SISCLOUD
cd /home/pi/sisbot-server/siscloud
# check if there are any fatal git errors
OUTPUT=$(git status 2>&1)
if echo "$OUTPUT" | grep -q "fatal:"; then
    echo "Siscloud git fatal error"

    IS_CONNECTED=$(check_internet)

    if [ "$IS_CONNECTED" = 0 ] ; then
      echo "Failure! Unable to connect to network, please retry."
    else
      # move out of folder
      cd /home/pi/sisbot-server

      # remove the folder
      rm -rf siscloud

      # clone the folder back
      git clone pi@webcenter.sisyphus-industries.com:/git/siscloud.git

      # npm install
      cd /home/pi/sisbot-server/siscloud && sudo -u pi npm install
    fi
else
  if [ -d "node_modules" ]; then
    echo "Siscloud node_modules found"
  else
    echo "Siscloud node_modules missing"
    IS_CONNECTED=$(check_internet)

    if [ "$IS_CONNECTED" = 0 ] ; then
      echo "Failure! Unable to connect to network, please retry."
    else
      # if package.json doesn't exist or is empty, reset head
      if [ ! -f "package.json" ] || [ ! -s "package.json" ]; then
        echo "Package.json missing/empty, git reset"
        git reset --hard
      fi

      sudo -u pi npm install
    fi
  fi
fi
#SISPROXY
cd /home/pi/sisbot-server/sisproxy
# check if there are any fatal git errors
OUTPUT=$(git status 2>&1)
if echo "$OUTPUT" | grep -q "fatal:"; then
    echo "Sisproxy git fatal error"

    IS_CONNECTED=$(check_internet)

    if [ "$IS_CONNECTED" = 0 ] ; then
      echo "Failure! Unable to connect to network, please retry."
    else
      # move out of folder
      cd /home/pi/sisbot-server

      # remove the folder
      rm -rf sisproxy

      # clone the folder back
      git clone pi@webcenter.sisyphus-industries.com:/git/sisproxy.git

      # npm install
      cd /home/pi/sisbot-server/sisproxy && sudo -u pi npm install
    fi
else
  git reset --hard
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
fi

start_time="$(date -u +%s)"

{
  sudo NODE_ENV=sisbot node server.js >> /var/log/sisyphus/proxy.log  2>&1
} || {
  end_time="$(date -u +%s)"
  elapsed="$(($end_time-$start_time))"
  echo "Test failure: $elapsed"
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
