#!/usr/bin/env bash
sudo ifdown wlan0
sudo cp /etc/network/interfaces.hotspot /etc/network/interfaces
sudo ifup wlan0
#sudo ifconfig wlan0 192.168.42.1

sudo service hostapd start
sudo service isc-dhcp-server start
