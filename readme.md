# Sisbot Server

> Web server that controls the Sisyphus sand plotter

Consists of a Node.js web server using Socket.io to provide a WebSocket API to the Sisyphus machine. It interfaces with the control library to cause the machine to move, play/pause, change brightness of the LEDs and more.

## Setup

1. Install [`nvm`](https://github.com/creationix/nvm) to manage Node.js versions.
2. Run `nvm install` to make sure you have the proper version of Node.js installed.
3. Run `nvm use` to activate the current version of Node.js (as specified in the `.nvmrc` file)
4. Run `npm install` to install project dependences.
5. Run `npm start` to boot up the application.
6. View the application at <http://localhost/>

## Development

- Tests are located in `test` and use Mocha, Chai, and Sinon.
- Configuration can be overridden by adding environment variables to your `.env` file.
- Setting defaults are set in `src/config/config.js`.

# Raspberry Pi 3 Setup Instructions

I haven't verified this yet by doing it again, but this is the general flow. Eventually we could make an image and transfer all this to SD cards, ready to go (other than wifi setup of course). But for now it's manual.

Initial Setup
-------------

Get the Pi online on your local network.

1. Get a raspberry pi loaded with vanilla Raspbian. I used NOOBS for the setup: https://www.raspberrypi.org/documentation/installation/noobs.md
2. Plug in a keyboard, mouse and monitor.
3. From the GUI, sign into your wireless network.
4. Open the terminal and type `ifconfig`. Note the local IP of the `wlan0` interface. Write that down.
5. Remove the keyboard, mouse and monitor.
6. From a computer on your local network, you can now access the pi's command line via SSH `ssh pi@1.2.3.4` where "1.2.3.4" is your pi's local IP. The password will be `raspberry`. (this should work on OSX or Linux. Windows SSH commands may be different)
7. Plug the sisbot into the top right USB port.

Clone the source code
---------------------

1. `cd ~`
2. `git clone https://github.com/BuiltByBig/sisbot-server.git` provide github credentials if repository is still private.
3. `cd sisbot-server`
4. `sudo sh pi-setup.sh` for auto setup
5. Wait for the pi to reboot
6. You should be live at http://sisbot.local/

If you want more control over the setup, skip this above last step and configure it manually as described below.

If you want the server running in your command line, you need to ssh in, kill it, and then restart it manually:

```sh
sudo killall node
cd ~/sisbot-server/ && npm start
```

Manual Pi Setup
============

Upgrade GCC
-----------

Compiling binary dependencies for node.js require GCC 4.8+. The default Raspbian version is older.

```bash
sudo apt-get update
sudo apt-get install gcc-4.8 g++-4.8
```

Follow the prompts and then run:

```bash
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.6 20
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.8 50
sudo update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-4.6 20
sudo update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-4.8 50
```


Getting it running
------------------

1. Connect the sisbot to the top right USB port, when looking into the usb ports with the PCB on the bottom.
2. `nano configs/default.cson` or edit a different config if you've made one for this bot.
3. Change `serialPath` to `"/dev/ttyACM0"`
4. `npm start` or `npm start -- other-config-name` to run a different config.
5. Open a web browser and go to `http://1.2.3.4/` (where 1.2.3.4 is your pi's local IP)
6. Try to use the jog controls. It should work!

Bonus Auto-discovery Instructions
---------------------------------

The following will make your pi accessible at http://sisbot.local/ regardless of internal network IP.

1. `sudo apt-get update`
2. `sudo apt-get upgrade`
3. `sudo apt-get install avahi-daemon`
4. `sudo nano /etc/hosts` and replace "raspberrypi" with "sisbot"
5. `sudo nano /etc/hostname` and replace "raspberrypi" with "sisbot"
6. `sudo /etc/init.d/hostname.sh`
7. `sudo reboot`
8. After it reboots, ssh in and run `cd sisbot-server && npm start`
9. go to: http://sisbot.local:4545/

Setting up NOOBS on Rpi
---------------------------------

1. Download "NOOBS" distribution to PC; unzip
2. Copy all unzipped files (but not "NOOBS v.___" top folder) to formatted 16GB SD card. (I failed to get this work with 8GB).
3. Put SD card into RPi, connect mouse, keyboard, monitor.  Provide 5V to micro-USB.
4. Choose Raspian install.  Get coffee (will take 20+ minutes).
5. After Rpi reboots to GUI (type "startx" if it boots to command line), set up Wifi by clicking icon in upper right.
6. Open command line window (icon upper menu bar).  Follow instructions above-- "Clone the source code"
7. Connect SBB, and test to make sure install worked.  (serialport module not loaded, "npm install serialport").

Make image file of tested Rpi install:
--------------------------------------

1.Take 16GB card with tested Sisyphus app out of Pi and put into PC cardreader.
2. Use diskimager (I used Win32DiskImager) to create img file on PC hardrive.
3. Use PC file to create copies on 16GB SD cards, as needed.
4. Can use multiple cardreaders simultaneously to write images on several SD's.
