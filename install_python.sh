#!/usr/bin/env bash

#  Install script to run the python DMA light strip controller on a PI
#  https://tutorials-raspberrypi.com/connect-control-raspberry-pi-ws2812-rgb-led-strips/
#

sudo apt-get update
sudo apt-get install python-dev -yq
sudo echo "blacklist snd_bcm2835" >> /etc/modprobe.d/snd-blacklist.conf

sudo sed -i 's/dtparam/#dtparam/g' /boot/config.txt
cd /home/pi/
git clone https://github.com/jgarff/rpi_ws281x
cd rpi_ws281x
sudo apt-get install scons -y
sudo scons

sudo apt-get install swig -y
cd python
wget https://pypi.python.org/packages/source/s/setuptools/setuptools-5.7.zip
sudo python ./setup.py build
sudo python ./setup.py install
