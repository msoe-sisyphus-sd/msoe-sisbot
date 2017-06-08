#!/usr/bin/env bash

sudo service hostapd stop
sudo service isc-dhcp-server stop

sudo ifdown wlan0
sudo cp /etc/network/interfaces.bak /etc/network/interfaces
sudo cp /etc/wpa_supplicant/wpa_supplicant.conf.bak /etc/wpa_supplicant/wpa_supplicant.conf
sudo echo "network={
	ssid=\"$1\"
	psk=\"$2\"
}" >> /etc/wpa_supplicant/wpa_supplicant.conf
sudo ifup wlan0

echo "Restarting wlan0..."
