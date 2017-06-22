#!/usr/bin/env bash

# comment/uncomment line in file
comment() {
  lua - "$1" "$2" "$3" <<EOF > "$3.bak"
local key=assert(arg[1])
local search=key:match("")
local value=assert(arg[2])
local fn=assert(arg[3])
local file=assert(io.open(fn))
local made_change=false
for line in file:lines() do
  if line:match("^#?%s*"..key..".*") then
		if value=="true" then
    	line="#"..key:gsub("%%","")
		else
    	line=key:gsub("%%","")
		end
    made_change=true
  end
  print(line)
end
EOF
sudo mv "$3.bak" "$3"
}

comment 'wpa=2' true /etc/hostapd/hostapd.conf
comment 'wpa_passphrase=sisyphus' true /etc/hostapd/hostapd.conf
comment 'wpa_key_mgmt=WPA-PSK' true /etc/hostapd/hostapd.conf
comment 'wpa_pairwise=CCMP' true /etc/hostapd/hostapd.conf
comment 'wpa_group_rekey=86400' true /etc/hostapd/hostapd.conf

echo "Upgrade_Finish completed"
