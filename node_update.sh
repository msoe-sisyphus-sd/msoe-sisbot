#!/usr/bin/env bash

# check what version of node is installed/used
NODE_V="$(node -v)"
PKG_NODE_V="$(dpkg -l nodejs 2>&1)"

# is this node 8?
if [[ $NODE_V != "v8."* ]]; then
  echo "Node is not v8.x.x"

  # do we have the apt-get package?
  if [[ $PKG_NODE_V == "dpkg-query: no packages found matching nodejs"* ]]; then
    echo "No nodejs package found"
    echo 'Acquire::ForceIPv4 "true";' | tee /etc/apt/apt.conf.d/99force-ipv4 |

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
      exit 1
    else
      echo "Success! Network found."

      # make sure it keeps trying to fix if stopped mid progress
      cp /home/pi/sisbot-server/sisbot/rc_fix.local /etc/rc.local

      # install nodejs via apt-get and -yq yes and quit
      curl -sL https://deb.nodesource.com/setup_8.x | bash -
      apt-get install -yq nodejs

      # remove version in /usr/local
      rm -rf /usr/local/bin/node
      rm -rf /usr/local/bin/npm
      rm -rf /usr/local/include/node
      # rm -rf /usr/local/lib/node_modeles ??

      # remove state file from proxy
      rm /home/pi/sisbot-server/sisproxy/state.json

      # delete existing node_modules folders, so they get rebuilt fresh
      rm -rf /home/pi/sisbot-server/siscloud/node_modules
      rm -rf /home/pi/sisbot-server/sisbot/node_modules
      rm -rf /home/pi/sisbot-server/sisproxy/node_modules

      # restart pi
      sleep 5
      reboot
    fi
  fi
else
  echo "$(node -v)"

  # check if package.json.bak exists, compare to package.json, if diff, reinstall
  echo "5" > /home/pi/sisbot-server/sisbot/update_status
  if [ -f "/home/pi/sisbot-server/siscloud/package.json.bak" ]; then
    if cmp -s /home/pi/sisbot-server/siscloud/package.json.bak /home/pi/sisbot-server/siscloud/package.json; then
      echo 'The siscloud package file is the same\n'
    else
      echo 'The siscloud package file is different\n'
      rm -rf /home/pi/sisbot-server/siscloud/node_modules
      cd /home/pi/sisbot-server/siscloud && npm install
    fi
  else
    echo 'The siscloud package backup is not there\n'
    rm -rf /home/pi/sisbot-server/siscloud/node_modules
    cd /home/pi/sisbot-server/siscloud && npm install
  fi

  echo "6" > /home/pi/sisbot-server/sisbot/update_status
  if [ -f "/home/pi/sisbot-server/sisbot/package.json.bak" ]; then
    if cmp -s /home/pi/sisbot-server/sisbot/package.json.bak /home/pi/sisbot-server/sisbot/package.json; then
      echo 'The sisbot package file is the same\n'
    else
      echo 'The sisbot package file is different\n'
      rm -rf /home/pi/sisbot-server/sisbot/node_modules
      cd /home/pi/sisbot-server/sisbot && npm install
    fi
  else
    echo 'The sisbot package backup is not there\n'
    rm -rf /home/pi/sisbot-server/sisbot/node_modules
    cd /home/pi/sisbot-server/sisbot && npm install
  fi

  echo "7" > /home/pi/sisbot-server/sisbot/update_status
  if [ -f "/home/pi/sisbot-server/sisproxy/package.json.bak" ]; then
    if cmp -s /home/pi/sisbot-server/sisproxy/package.json.bak /home/pi/sisbot-server/sisproxy/package.json; then
      echo 'The sisproxy package file is the same\n'
    else
      echo 'The sisproxy package file is different\n'
      rm -rf /home/pi/sisbot-server/sisproxy/node_modules
      cd /home/pi/sisbot-server/sisproxy && npm install
    fi
  else
    echo 'The sisproxy package backup is not there\n'
    rm -rf /home/pi/sisbot-server/sisproxy/node_modules
    cd /home/pi/sisbot-server/sisproxy && npm install
  fi

  # update_status
  echo "8" > /home/pi/sisbot-server/sisbot/update_status

  # make sure pi user is owner of all files
  cd /home/pi/sisbot-server/
  sudo chown -R pi sisbot
  sudo chown -R pi siscloud
  sudo chown -R pi sisproxy

  # remove this step from startup
  cp /home/pi/sisbot-server/sisbot/rc.local /etc
fi
