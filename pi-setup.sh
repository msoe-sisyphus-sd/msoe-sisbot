#!/usr/bin/env bash

# Update default config serial port
sed -i -e 's/cu.usbmodem14231/ttyACM0/g' configs/default.cson

echo "Updating apt-get..."
apt-get --assume-yes update
apt-get --assume-yes upgrade

echo "Installing GCC v4.8..."
apt-get --assume-yes install gcc-4.8 g++-4.8
update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.6 20
update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.8 50
update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-4.6 20
update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-4.8 50

echo "Installing wifi access point..."
apt-get --assume-yes install hostapd
apt-get --assume-yes install dnsmasq

echo "Installing node.js..."
cd /home/pi
wget http://nodejs.org/dist/v5.11.1/node-v5.11.1-linux-armv7l.tar.gz
tar -xvf node-v5.11.1-linux-armv7l.tar.gz
cd node-v5.11.1-linux-armv7l
cp -R * /usr/local/

echo "Installing sisbot-server npm depencies..."
cd /home/pi/sisbot-server
npm install
chown -R pi /home/pi/sisbot-server

echo "Start sisbot-server on startup..."
echo '#!/bin/sh -e' > /etc/rc.local
echo "cd /home/pi/sisbot-server && /usr/bin/env npm start &" >> /etc/rc.local
echo "exit 0" >> /etc/rc.local
cat /etc/rc.local

echo "Configuring sisbot.local..."
apt-get --assume-yes install avahi-daemon
sed -i -e 's/raspberrypi/sisbot/g' /etc/hosts
sed -i -e 's/raspberrypi/sisbot/g' /etc/hostname
/etc/init.d/hostname.sh
reboot
