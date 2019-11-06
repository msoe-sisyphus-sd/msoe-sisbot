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

# fix factory reset issue
cp /home/pi/sisbot-server/sisbot/factory_reset.sh /home/pi/sisbot-server/

# make sure log file location existsSync
mkdir -p /var/log/sisyphus

# Change the git repos over to webcenter
pushd /home/pi/sisbot-server/sisbot
git remote set-url origin pi@webcenter.sisyphus-industries.com:/git/sisbot.git
popd

pushd /home/pi/sisbot-server/siscloud
git remote set-url origin pi@webcenter.sisyphus-industries.com:/git/siscloud.git
popd

pushd /home/pi/sisbot-server/sisproxy
git remote set-url origin pi@webcenter.sisyphus-industries.com:/git/sisproxy.git
popd

# make sure we are on node 8.x.x
sudo /home/pi/sisbot-server/sisbot/node_update.sh > /var/log/sisyphus/node_update.log

# update_status
echo "9" > /home/pi/sisbot-server/sisbot/update_status

# make sure python is installed
sudo /home/pi/sisbot-server/sisbot/install_python.sh

echo "Upgrade_Finish completed"

# 1.0-1.2 reboot necessity, to make sure bluetooth updates self
if [ -z "$1" ]; then
	sudo reboot
fi
