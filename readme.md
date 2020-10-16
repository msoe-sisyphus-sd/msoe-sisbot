# MSOE Senior Design Team (WIP) Setup

## Lights

### The Best Approach
* Buy some adafruit neopixels.
* Obtain a power stepper chip and power supply from adafruit.
* TODO - @ anyone who didn't set up their pi with the "I'm Broke Approach"

### The I'm-Broke Approach
* Buy a tiny adafruit neopixel [ring](https://www.googleadservices.com/pagead/aclk?sa=L&ai=DChcSEwiirOOo9KXsAhUP1sAKHWwHAmsYABAEGgJpbQ&ohost=www.google.com&cid=CAESQeD2k_xiOmpFU0NrGgKOQiSYEKDUKC_M6YeXkzNyOzruKMVyXRzbfb-lRwNbRhyCz9seKd6PXzYYWGN0_7Sc-eMU&sig=AOD64_12sBla0PVDRv2xbXUjTMTBWO6tkg&ctype=5&q=&ved=2ahUKEwib1deo9KXsAhXCHM0KHbWoBp8Q9aACegQIDBA6&adurl=)
* Obtain 4 AAAA batteries, and a [battery holder](https://www.adafruit.com/product/3859)
* Buy some very cheap jumper cables. You will need 2 male-male and 2 male-female.
  * EECS helpdesk has some, and any EE student will also have some on hand you can borrow.
  * Ebay sells these at approximately $2/bundle.
* Obtain a breadboard. I got mine [here](https://www.ebay.com/itm/Universal-Mini-Solderless-Breadboard-400-Tie-Points-Arduino-and-Raspberry-Pi/193530856290?_trkparms=ispr%3D1&hash=item2d0f568362:g:LoIAAOSwAadfey5L&amdata=enc%3AAQAFAAACYBaobrjLl8XobRIiIML1V4Imu%252Fn%252BzU5L90Z278x5ickkfKe2vUidqHRg3XM2X2xOVP5H%252BeinU9fPtGWoMnxsCfTlWSvBiOIZi5vO65OBeNaHW9iwoAferZ%252Fpe2w74y%252FWPnFp3%252FQI34iZpSSGQ%252F8KEOhy8Gw0uXyinTdtSOrHmI5nKhgPDxu5ySrTA14RK8Cpnga50kTMdSX5N0mTQ5NGOeWZFqOSNgIpgQ8fvF%252BHlyXSvt%252Fw7Tiy1qSwv1yRPz2xELkggsGISLKuTo7e2bl%252Bla6uy0Pp4Xyvn6m4oYOcSp%252B7n75NX94UiPsiBbRC%252Ben0VOYndISADAZh2YUdwtZ%252FOm2Ef9J%252B%252BJqgkEC5rhGtB32RlMVBmUsQksVyXgf3yaFTNAGUEn6kU31PHDut%252FMAEXPIONOhLmZQwvoDWv1oyNhDyS49VqSUOGujqTkLp64cUjdpphPz9p2OGJIPcxyGBmdnLrHs9zMV%252FykMAk8D%252BwVIm%252BFxhSqhT%252BwiP0GC3emm4UJF4UIc5MNLAsmLOj1fy%252BbZt3kXNXMqnMba3IJOnJO7nzDd8fPLbZa%252BZHzROPksWOuuVAn7TJEb1JCqcYs%252Bzkuv5QprQPkY%252Bm3HnsapmqoC4bIkr7Kmk5LEq1zIzsoHxGUXgTqv8ySFntAsmx3qzBzuaiUE%252FNybaOw3W%252BjD5vM3CdVlZd%252BInlVejBTZ97KKKtAdU%252B1HzdPvCT1sH28NKIi0o%252FvCK%252B9WgEGpR8%252FwE0ku3lT1i4KE9szlyIbvrhuNYrhApKbHm5CZlHX%252FWoHvQuBHzMAYc4pg3ge2ysK2CDszc%7Ccksum%3A1935308562907c997ec6791e44859ffc986a7da9c496%7Campid%3APL_CLK%7Cclp%3A2334524) for $4.
* Wiring:
  * Connect the red lead on the battery housing to the (+) length-wise vertical column of the breadboard.
  * Connect the black lead on the battery housing to the (-) length-wise vertical column on the breadboard.
  * Connect a female-male lead from a GND on the raspberry pi to the (-) length-wise vertical column on the breadboard. This should be the same column the battery is using.
  * Connect a male-female lead from GPIO 18 on the raspberry pi to the DataIn on the neopixel.
  * Connect a male-female lead from a GND on the neopixel to the (-) column on the breadboard, after the GND from the raspberry pi.
  * Connect a male-female lead from the 5V on the neopixel to the (+) column on the breadboard.

* Your pixels should now be connected. They WILL NOT light up until you run something on them, so don't be alarmed if they do nothing.
* Make friends with someone who owns a soldering iron and have the solder your cables to the neopixel itself. This is not required but can save some connectivity headaches.
* This section is a work in progress and will be updated as the semester continues.


## Pi Setup

### The Quick and Dirty Approach
* Probably the easiest way to do this is going to be to use a production image off the SD card.
* This image is currently located [here](https://msoe365-my.sharepoint.com/:u:/g/personal/flemingg_msoe_edu/EcWzDhn2a0xEp_nhoAfBOZsBfAl_P7hAyI2DwEuwnBZu2g?e=OErzQn)
* Once you have downloaded the disk file, you will need to use a disk imager.
  * I used the disk imager [here](https://sourceforge.net/projects/win32diskimager/)
  * It looks like malware but it worked for me.
* Use disk imager to write to a CLEAN sd card (see linked article above). Be careful that you are writing the correct card!
  * This might take a bit to write. For me it took ~20 minutes.
* Once written, you can run the image on a raspberry pi 3. I am not sure whether this works on a pi 4, so be careful.

* For adding access to our team's work in gitlab without losing sync with the origin, run the following commands:
  * in /home/pi/sisbot-server/sisproxy: `git remote add fork git@gitlab.com:msoe.edu/sdl/sd21/sisyphus/msoe-sisproxy.git`
  * in /home/pi/sisbot-server/siscloud: `git remote add fork git@gitlab.com:msoe.edu/sdl/sd21/sisyphus/msoe-siscloud.git`
  * in /home/pi/sisbot-server/sisbot: `git remote add fork git@gitlab.com:msoe.edu/sdl/sdl21/sisyphus/msoe-sisbot.git`

* Now when you push and pull from our team's repo, you'll use commands like `git pull fork master` or `git push fork <my-feature-branch`.


### A More Refined Approach
TODO - how to manually get pi to prod standards

# Sisbot Server

> Web server that controls the Sisyphus sand plotter

Consists of a Node.js web server using Socket.io to provide a WebSocket API to the Sisyphus machine. It interfaces with the control library to cause the machine to move, play/pause, change brightness of the LEDs and more.

## Setup

1. Install [`nvm`](https://github.com/creationix/nvm) to manage Node.js versions.
2. Run `nvm install` to make sure you have the proper version of Node.js installed.
3. Run `nvm use` to activate the current version of Node.js (as specified in the `.nvmrc` file)
4. Run `npm install` to install project dependences.
5. Make a copy of `configs/example-whichcson.js` and rename it to `configs/whichcson.js`
6. Modify the module export in `configs/whichcson.js` to be `default.cson`
7. Run `npm start` to boot up the application.
8. View the application at <http://localhost/>

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
