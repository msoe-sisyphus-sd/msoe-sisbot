#!/usr/bin/env bash

# comment/uncomment line in file
comment() {
  lua - "$1" "$2" "$3" <<EOF > "$3.tmp"
local key=assert(arg[1])
local search=key:match("")
local value=assert(arg[2])
local fn=assert(arg[3])
local file=assert(io.open(fn))
local made_change=false
for line in file:lines() do
  if value=="true" then
    if line:match("^%s*"..key..".*") then
    	line="#"..line:gsub("%%","")
    end
  else
    if line:match("^#%s*"..key..".*") then
    	line=line:sub(2):gsub("%%","")
    end
  end
  print(line)
end
EOF
sudo mv "$3.tmp" "$3"
}

# replace line in file (also uncomments)
replace() {
  lua - "$1" "$2" "$3" <<EOF > "$3.tmp"
local key=assert(arg[1])
local search=key:match("")
local value=assert(arg[2])
local fn=assert(arg[3])
local file=assert(io.open(fn))
for line in file:lines() do
  if line:match("^#?%s*"..key..".*") then
    line=value:gsub("%%","")
  end
  print(line)
end
EOF
sudo mv "$3.tmp" "$3"
}

sudo ifdown wlan0

# make sure services are down (in case of restart)
sudo service hostapd stop
sudo service isc-dhcp-server stop

sudo cp /etc/network/interfaces.hotspot /etc/network/interfaces
sudo cp /etc/wpa_supplicant/wpa_supplicant.conf.bak /etc/wpa_supplicant/wpa_supplicant.conf # clear wpa_supplicant

# set password if given
size=${#1}
if [ -n "$1" ] && [ "$size" -gt 7 ]; then
  comment 'wpa=2' false /etc/hostapd/hostapd.conf
  replace "wpa_passphrase=" "wpa_passphrase=$1" /etc/hostapd/hostapd.conf
  # needs to be WPA-PSK
  replace 'wpa_key_mgmt=WPA' 'wpa_key_mgmt=WPA-PSK' /etc/hostapd/hostapd.conf
  comment 'wpa_pairwise=CCMP' false /etc/hostapd/hostapd.conf
  comment 'wpa_group_rekey=86400' false /etc/hostapd/hostapd.conf
else
  comment 'wpa=2' true /etc/hostapd/hostapd.conf
  # reset to sisyphus, and comment out
  replace 'wpa_passphrase=' '#wpa_passphrase=sisyphus' /etc/hostapd/hostapd.conf
  comment 'wpa_key_mgmt=WPA' true /etc/hostapd/hostapd.conf
  comment 'wpa_pairwise=CCMP' true /etc/hostapd/hostapd.conf
  comment 'wpa_group_rekey=86400' true /etc/hostapd/hostapd.conf
fi

sudo ifup wlan0
#sudo ifconfig wlan0 192.168.42.1

sudo systemctl daemon-reload
sudo service hostapd start
sudo service isc-dhcp-server start

echo "Hotspot enabled"
