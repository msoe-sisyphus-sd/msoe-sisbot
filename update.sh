#!/usr/bin/env bash

save_backup () {
	echo "Save Backup"
	cd /home/pi/sisbot-server/
	mkdir -p backup.0
	sudo cp -rf sisbot/ backup.0/
	sudo cp -rf siscloud/ backup.0/
	sudo cp -rf sisproxy/ backup.0/
	sudo rm -rf /home/pi/sisbot-server/backup
	sudo mv -f /home/pi/sisbot-server/backup.0/ /home/pi/sisbot-server/backup
}

# make backup if master branch
#if [ -z "$1" ] && [ -z "$2" ] && [ -z "$3" ]; then
	# save_backup
#elif [ "$1" = "master" ] && [ "$2" = "master" ] && [ "$3" = "master" ]; then
	# save_backup
#fi

# update_status
echo "1" > /home/pi/sisbot-server/sisbot/update_status

# backup each of the package files
cd /home/pi/sisbot-server/sisbot
cp package.json package.json.bak
cd /home/pi/sisbot-server/siscloud
cp package.json package.json.bak
cd /home/pi/sisbot-server/sisproxy
cp package.json package.json.bak

cd /home/pi/sisbot-server/sisbot
# Check for .git/index.lock
if [ -f ".git/index.lock" ]; then
	rm .git/index.lock
fi
git reset --hard
if [ -n "$1" ]; then
	git pull --no-edit origin "$1"
else
	git pull origin master
fi

# update_status
echo "2" > /home/pi/sisbot-server/sisbot/update_status

cd /home/pi/sisbot-server/siscloud
# Check for .git/index.lock
if [ -f ".git/index.lock" ]; then
	rm .git/index.lock
fi
git reset --hard
if [ -n "$2" ]; then
	git pull --no-edit origin "$2"
else
	git pull origin master
fi

# update_status
echo "3" > /home/pi/sisbot-server/sisbot/update_status

cd /home/pi/sisbot-server/sisproxy
# Check for .git/index.lock
if [ -f ".git/index.lock" ]; then
	rm .git/index.lock
fi
git reset --hard
if [ -n "$3" ]; then
	git pull --no-edit origin "$3"
else
	git pull origin master
fi

# update_status
echo "4" > /home/pi/sisbot-server/sisbot/update_status

cd /home/pi/sisbot-server/
sudo chown -R pi sisbot
sudo chown -R pi siscloud
sudo chown -R pi sisproxy

if [ -n "$4" ]; then
	sudo /home/pi/sisbot-server/sisbot/update_finish.sh "$4"
else
	sudo /home/pi/sisbot-server/sisbot/update_finish.sh
fi

echo "Upgrade completed"

# sudo killall node
# cd /home/pi/sisbot-server/sisproxy && sudo NODE_ENV=sisbot node server.js &
