#!/usr/bin/env bash

# makes change to a file
add_after() {
  lua - "$1" "$2" "$3" <<EOF > "$3.bak"
local key=assert(arg[1])
local value=assert(arg[2])
local fn=assert(arg[3])
local file=assert(io.open(fn))
local made_change=false
for line in file:lines() do
  print(line)
  if line:match("^#?%s*"..key) then
    print(value)
    made_change=true
  end
end
if made_change==false then
        print(line)
end
EOF
sudo mv "$3.bak" "$3"
}

if [ -n "$1" ]; then
	sudo service hostapd stop
	sudo service isc-dhcp-server stop

	sudo ip link set wlan0 down
	# sudo ifdown wlan0
	sudo cp /etc/network/interfaces.bak /etc/network/interfaces
	sudo cp /etc/wpa_supplicant/wpa_supplicant.conf.bak /etc/wpa_supplicant/wpa_supplicant.conf

	if [ -n "$2" ]; then
		sudo wpa_passphrase "$1" "$2" | sudo tee -a /etc/wpa_supplicant/wpa_supplicant.conf

		if [ -n "$3" ]; then
			# mark ssid_scan=1 since this network may be hidden
			add_after "ssid=\"$1\"" "	scan_ssid=1" /etc/wpa_supplicant/wpa_supplicant.conf
		fi
	else
		sudo echo "network={
		ssid=\"$1\"
		key_mgmt=NONE
}" >> /etc/wpa_supplicant/wpa_supplicant.conf
	fi

	sudo ip link set wlan0 up
	# sudo ifup wlan0

	echo "Restarting wlan0..."
else
	echo "No Network name provided"
fi
