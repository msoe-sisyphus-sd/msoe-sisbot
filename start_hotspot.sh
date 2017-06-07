#!/usr/bin/env bash
sudo ifdown wlan0

# make sure services are down (in case of restart)
sudo service hostapd stop
sudo service isc-dhcp-server stop

sudo cp /etc/network/interfaces.hotspot /etc/network/interfaces
sudo ifup wlan0
#sudo ifconfig wlan0 192.168.42.1

sudo systemctl daemon-reload
sudo service hostapd start
sudo service isc-dhcp-server start

echo "Hotspot enabled"
