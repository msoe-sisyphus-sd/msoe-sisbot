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
RETRIES=0
FAILED=false
while ! ping -c 1 -W 2 google.com ; do
    sleep 1
		RETRIES=RETRIES+1
if [ "$RETRIES" > "100" ] ; then
	FAILED=true
fi
done

if [ "$FAILED" = false ] ; then
echo "Failure! Network not found."
sudo ./start_hostspot.sh
else
echo "Success! Network found."
fi
