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
if made_change==false then
	local line
	if value=="true" then
		line="#"..key:gsub("%%","")
	else
		line=key:gsub("%%","")
	end
	print(line)
end
EOF
sudo mv "$3.bak" "$3"
}

echo "Checking for a wifi module."
echo
echo -n "Your wifi module is "
lsusb > .lsusb
# check for rtl8188eu compatible driver
if   cat .lsusb | grep -i '2357:010C\|056E:4008\|2001:3311\|0DF6:0076\|2001:3310\|2001:330F\|07B8:8179\|0BDA:0179\|0BDA:8179' ; then
	driver=8188eu
# check for rtl8812au compatible driver
elif cat .lsusb | grep -i '2357:010E\|0411:025D\|2019:AB32\|7392:A813\|056E:4007\|0411:0242\|0846:9052\|056E:400F\|056E:400E\|0E66:0023\|2001:3318\|2001:3314\|04BB:0953\|7392:A812\|7392:A811\|0BDA:0823\|0BDA:0820\|0BDA:A811\|0BDA:8822\|0BDA:0821\|0BDA:0811\|2357:010E\|2357:0122\|148F:9097\|20F4:805B\|050D:1109\|2357:010D\|2357:0103\|2357:0101\|13B1:003F\|2001:3316\|2001:3315\|07B8:8812\|2019:AB30\|1740:0100\|1058:0632\|2001:3313\|0586:3426\|0E66:0022\|0B05:17D2\|0409:0408\|0789:016E\|04BB:0952\|0DF6:0074\|7392:A822\|2001:330E\|050D:1106\|0BDA:881C\|0BDA:881B\|0BDA:881A\|0BDA:8812' ; then
	driver=8812au
# check for rtl8192eu compatible driver
elif cat .lsusb | grep -i '2019:AB33\|2357:0109\|2357:0108\|2357:0107\|2001:3319\|0BDA:818C\|0BDA:818B' ; then
	driver=8192eu
# check for mt7601Usta compatible driver
elif cat .lsusb | grep -i '148F:7650\|0B05:17D3\|0E8D:760A\|0E8D:760B\|13D3:3431\|13D3:3434\|148F:6370\|148F:7601\|148F:760A\|148F:760B\|148F:760C\|148F:760D\|2001:3D04\|2717:4106\|2955:0001\|2955:1001\|2955:1003\|2A5F:1000\|7392:7710' ; then
	driver=mt7601
# check for mt7610u compatible driver
      elif cat .lsusb | grep -i '0E8D:7650\|0E8D:7630\|2357:0105\|0DF6:0079\|0BDB:1011\|7392:C711\|20F4:806B\|293C:5702\|057C:8502\|04BB:0951\|07B8:7610\|0586:3425\|2001:3D02\|2019:AB31\|0DF6:0075\|0B05:17DB\|0B05:17D1\|148F:760A\|148F:761A\|7392:B711\|7392:A711\|0E8D:7610\|13B1:003E\|148F:7610' ; then
	driver=mt7610
# check for mt7612u compatible driver
elif cat .lsusb | grep -i '0E8D:7662\|0E8D:7632\|0E8D:7612\|0B05:17C9\|045E:02E6\|0B05:17EB\|0846:9053\|0B05:180B\|0846:9014\|7392:B711\|057C:8503\|0E8D:761B' ; then
	driver=mt7612
fi

if [[ ! $driver ]] ; then
	echo "not found."
	echo
	echo "**** Make sure onboard adapter is activew ****"
	echo
	echo "The script only works for wifi modules using the rtl8188eu, rtl8192eu, rtl8812au, mt7601, mt7610 and mt7612 drivers."
	echo "Looking for your wifi module the script detected the following USB devices:-"
	echo
	cat .lsusb
	echo

	# check the /boot/config.txt file to make sure 'dtoverlay=pi3-disable-wifi' is off
	if grep -q '#dtoverlay=pi3-disable-wifi' '/boot/config.txt'; then
		echo 'Onboard adapter enabled, no changes'
	else
		echo 'Enable onboard adapter'
		comment 'dtoverlay=pi3%-disable%-wifi' true /boot/config.txt
		reboot
	fi
else
	echo
	echo "And it uses the $driver driver."
	echo

	# check the /boot/config.txt file to make sure 'dtoverlay=pi3-disable-wifi' is on
	if grep -q 'dtoverlay=pi3-disable-wifi' '/boot/config.txt'; then

		if grep -q '#dtoverlay=pi3-disable-wifi' '/boot/config.txt'; then
			echo 'Disable onboard adapter'
			comment 'dtoverlay=pi3%-disable%-wifi' false /boot/config.txt
			reboot
		else
			echo 'Onboard adapter disabled, no changes'
		fi
	else
		echo 'New Disable onboard adapter'
		comment 'dtoverlay=pi3%-disable%-wifi' false /boot/config.txt
		reboot
	fi

fi

exit 0
