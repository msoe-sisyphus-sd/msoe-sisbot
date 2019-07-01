#!/usr/bin/env bash

# comment/uncomment line in file
comment() {
  lua - "$1" "$2" "$3" <<EOF > "$3.bak"
local key=assert(arg[1])
local search=key:match("")
local value=assert(arg[2])
local fn=assert(arg[3])
local file=assert(io.open(fn))
local made_change=false
for line in file:lines() do
  if line:match("^#?%s*"..key..".*") then
		if value=="true" then
    	line="#"..key:gsub("%%","")
		else
    	line=key:gsub("%%","")
		end
    made_change=true
  end
  print(line)
end
EOF
sudo mv "$3.bak" "$3"
}

# fix unknown hosts issue
config0="/home/pi/.ssh/config"
if [ -e "$config0" ]; then
  echo "$config0 exists. Great!"
else
	sudo echo -e "Host *\n\tStrictHostKeyChecking no\n\tUserKnownHostsFile=/dev/null" > /home/pi/.ssh/config
	sudo cp /home/pi/.ssh/config /root/.ssh/config
	sudo /etc/init.d/ssh restart
fi

# make sure ntp is enabled
timedatectl set-ntp true

# fix USB npm compile issue
PKG_LIBUDEV_V="$(dpkg -l libudev-dev 2>&1)"
if [[ $PKG_LIBUDEV_V == "dpkg-query: no packages found matching libudev-dev"* ]]; then
  echo "No libudev package found"
  apt-get install -yq libudev-dev
fi

# fix factory reset issue
cp /home/pi/sisbot-server/sisbot/factory_reset.sh /home/pi/sisbot-server/

# update rc.local
cp /home/pi/sisbot-server/sisbot/rc_fix.local /etc/rc.local

# make sure log file location existsSync
mkdir -p /var/log/sisyphus

# make sure we are on node 8.x.x
sudo /home/pi/sisbot-server/sisbot/node_update.sh > /var/log/sisyphus/node_update.log

echo "Upgrade_Finish completed"

# 1.0-1.2 reboot necessity, to make sure bluetooth updates self
if [ -z "$1" ]; then
	sudo reboot
fi
