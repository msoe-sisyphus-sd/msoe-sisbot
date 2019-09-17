#!/bin/sh

zone=$(wget -O - -q http://geoip.ubuntu.com/lookup | sed -n -e 's/.*<TimeZone>\(.*\)<\/TimeZone>.*/\1/ p')

#echo $zone <- prints out correctly the local timezone

if [ "$zone" != "" ]; then
    echo $zone > /etc/timezone
    # dpkg-reconfigure -f noninteractive tzdata > /dev/null 2>&1
    dpkg-reconfigure -f noninteractive tzdata
fi
