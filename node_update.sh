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
    echo 'Acquire::ForceIPv4 "true";' | sudo tee /etc/apt/apt.conf.d/99force-ipv4
    # install nodejs via apt-get and -yq yes and quit
    curl -sL https://deb.nodesource.com/setup_8.x | bash - 
    apt-get install -yq nodejs 
    
  fi

  # remove version in /usr/local
  rm -rf /usr/local/bin/node
  rm -rf /usr/local/bin/npm
  rm -rf /usr/local/include/node
  # rm -rf /usr/local/lib/node_modeles ??

  # restart pi
  reboot
else
  echo "$(node -v)"

  # delete existing node_modules folders, so they get rebuilt fresh
  rm -rf /home/pi/sisbot-server/siscloud/node_modules
  rm -rf /home/pi/sisbot-server/sisbot/node_modules
  rm -rf /home/pi/sisbot-server/sisproxy/node_modules

  # run npm install
  cd /home/pi/sisbot-server/siscloud && npm install
  cd /home/pi/sisbot-server/sisbot && npm install
  cd /home/pi/sisbot-server/sisproxy && npm install

  # make sure pi user is owner of all files
  cd /home/pi/sisbot-server/
  sudo chown -R pi sisbot
  sudo chown -R pi siscloud
  sudo chown -R pi sisproxy

  # remove this step from startup
  cp /home/pi/sisbot-server/sisbot/rc.local /etc
fi
