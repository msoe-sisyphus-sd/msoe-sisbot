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

# fix unknown hosts issue
sudo echo "Host *\nStrictHostKeyChecking no\nUserKnownHostsFile=/dev/null" > /home/pi/.ssh/config
sudo echo "Host *\nStrictHostKeyChecking no\nUserKnownHostsFile=/dev/null" > /root/.ssh/config
sudo /etc/init.d/ssh restart

echo "Upgrade_Finish completed"
