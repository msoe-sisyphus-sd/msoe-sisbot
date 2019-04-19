#!/usr/bin/env bash

# check what version of node is installed/used
NODE_V="$(node -v)"
PKG_NODE_V="$(dpkg -l nodejs)"

# is this node 8?
if [${NODE_V:0:3} != "v8."]; then
  echo "Node is not v8.x.x"

  # do we have the apt-get package?
  if [${PKG_NODE_V} = "dpkg-query: no packages found matching nodejs"] then
    echo "No nodejs package found"

    # install via apt-get
    curl -sL https://deb.nodesource.com/setup_8.x | bash -
    apt-get install -yq nodejs
  fi

  # remove version in /usr/local
  rm -rf /usr/local/bin/node
  rm -rf /usr/local/bin/npm
  rm -rf /usr/local/include/node
  # rm -rf /usr/local/lib/node_modeles ??

  # delete existing node_modules folders, so they get rebuilt on startup
  rm -rf /home/pi/sisbot-server/siscloud/node_modules
  rm -rf /home/pi/sisbot-server/sisbot/node_modules
  rm -rf /home/pi/sisbot-server/sisproxy/node_modules

  # restart pi
  reboot
else
  echo "$(node -v)"

  # rerun npm install, npm audit fix
  cd /home/pi/sisbot-server/siscloud && npm install
  cd /home/pi/sisbot-server/sisbot && npm install
  cd /home/pi/sisbot-server/sisproxy && npm install

  # remove this step from startup
  cp /home/pi/sisbot-server/sisbot/rc.local /etc
fi
