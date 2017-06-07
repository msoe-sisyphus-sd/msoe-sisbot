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

OLDHOST=$(hostname -f)

# change hostname
if [-n "$1"]; then
	hostname "$1"
	sudo echo "$1" > /home/pi/hostname
	sudo mv /home/pi/hostname /etc/hostname
	find_replace "127.0.1.1%s*$OLDHOST" "127.0.1.1	$1" /etc/hosts
	find_replace "127.0.1.1%s*$OLDHOST.local" "127.0.1.1	$1.local" /etc/hosts

	# match the wifi network name too
	find_replace "ssid=[a-zA-Z0-9]" "ssid=$1" /etc/hostapd/hostapd.conf
fi

# reboot?
