#!/usr/bin/env bash

# makes change to a file
find_replace() {
  lua - "$1" "$2" "$3" <<EOF > "$3.bak"
local key=assert(arg[1])
local value=assert(arg[2])
local fn=assert(arg[3])
local file=assert(io.open(fn))
local made_change=false
for line in file:lines() do
  if line:match("^#?%s*"..key) then
    line=value
    made_change=true
  end
  print(line)
end
EOF
sudo mv "$3.bak" "$3"
}

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

# Update default config serial port
sed -i -e 's/cu.usbmodem14231/ttyACM0/g' configs/default.cson

#echo "Renaming hostname..."
#sudo echo "sisyphus" > /home/pi/hostname
#sudo mv /home/pi/hostname /etc/hostname
#find_replace 127.0.1.1%s*rasberrypi "127.0.1.1	sisyphus" /etc/hosts

echo "Making Network backups..."
sudo cp /etc/network/interfaces /etc/network/interfaces.bak
sudo cp interfaces.hotspot /etc/network/interfaces.hotspot

# setup wifi
echo "Copying network settings..."
sudo cp /etc/wpa_supplicant/wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant.conf.bak
sudo cp wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant.conf
sudo ifdown wlan0 && sudo ifup wlan0

while ! ping -c 1 -W 2 google.com; do
    echo "Waiting for google.com - network interface might be down..."
    sleep 1
done

echo "Updating libraries..."
sudo apt-get update
sudo apt-get upgrade -y
INSTALL_PKGS="git hostapd isc-dhcp-server gcc-4.8 g++-4.8"
for i in $INSTALL_PKGS; do
  sudo apt-get install -y $i
done
update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.6 20
update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.8 50
update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-4.6 20
update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-4.8 50

echo "Creating hotspot settings..."
sudo cp hostapd.conf /etc/hostapd/hostapd.conf
find_replace \#DAEMON_CONF="" DAEMON_CONF="/etc/hostapd/hostapd.conf" /etc/default/hostapd
comment 'option domain%-name "example%.org";' true /etc/dhcp/dhcpd.conf
comment 'option domain%-name%-servers ns1%.example%.org, ns2%.example%.org;' true /etc/dhcp/dhcpd.conf
comment 'authoritative;' false /etc/dhcp/dhcpd.conf
cat subnet.hotspot >> /etc/dhcp/dhcpd.conf
find_replace ="" ="wlan0" /etc/default/isc-dhcp-server
find_replace DAEMON_CONF= DAEMON_CONF=/etc/hostapd/hostapd.conf /etc/init.d/hostapd

echo "Installing node.js..."
cd /home/pi/
wget http://nodejs.org/dist/v5.11.1/node-v5.11.1-linux-armv7l.tar.gz
tar -xvf node-v5.11.1-linux-armv7l.tar.gz
cd node-v5.11.1-linux-armv7l
cp -R * /usr/local/
cd ../
rm -rf node-v5.11.1-linux-armv7l
rm node-v5.11.1-linux-armv7l.tar.gz

echo "Installing sisbot-server npm depencies..."
cd /home/pi/sisbot-server
npm install
chown -R pi /home/pi/sisbot-server

echo "Readying hotspot..."
sudo cp /etc/network/interfaces.hotspot /etc/network/interfaces
sudo chmod 755 /etc/init.d/hostapd

echo "Expand filesystem..."
sudo raspi-config --expand-rootfs

echo "*** Install Complete ***"
sudo reboot
