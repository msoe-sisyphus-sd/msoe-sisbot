#!/usr/bin/env bash

if [ -n "$1" ]; then
	sudo service hostapd stop
	sudo service isc-dhcp-server stop

	sudo ifdown wlan0
	sudo cp /etc/network/interfaces.bak /etc/network/interfaces
	sudo cp /etc/wpa_supplicant/wpa_supplicant.conf.bak /etc/wpa_supplicant/wpa_supplicant.conf

	if [ -n "$2" ]; then
		sudo wpa_passphrase "$1" "$2" | sudo tee -a /etc/wpa_supplicant/wpa_supplicant.conf
	else
		sudo echo "network={
		ssid=\"$1\"
		key_mgmt=NONE
}" >> /etc/wpa_supplicant/wpa_supplicant.conf
	fi

	sudo ifup wlan0

	echo "Restarting wlan0..."
else
	echo "No Network name provided"
fi
