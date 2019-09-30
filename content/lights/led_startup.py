#!/usr/bin/env python3
# Sisyphus NeoPixel Pattern Controller
# Author: Matthew Klundt (matt@withease.io)
#
# Runs socket for LED data to match patterns with ball position on Sisyphus Industries LLC tables.

import time
from neopixel import *
import argparse
import sys
import fcntl, os
import errno
import signal
import struct # convert bytest to float

from colorFunctions import fill
from colorFunctions import colorWipe
from colorFunctions import colorBlend
from colorFunctions import wheel
from easing import easeIn

# LED strip configuration:
LED_PIN        = 18      # GPIO pin connected to the pixels (18 uses PWM!).
#LED_PIN        = 10      # GPIO pin connected to the pixels (10 uses SPI /dev/spidev0.0).
LED_FREQ_HZ    = 800000  # LED signal frequency in hertz (usually 800khz)
LED_DMA        = 10      # DMA channel to use for generating signal (try 10)
LED_BRIGHTNESS = 255     # Set to 0 for darkest and 255 for brightest
LED_INVERT     = False   # True to invert the signal (when using NPN transistor level shift)
LED_CHANNEL    = 0       # set to '1' for GPIOs 13, 19, 41, 45 or 53

SK6812_STRIP_RGBW =                       0x18100800
SK6812_STRIP_RBGW =                       0x18100008
SK6812_STRIP_GRBW =                       0x18081000
SK6812_STRIP_GBRW =                       0x18080010
SK6812_STRIP_BRGW =                       0x18001008
SK6812_STRIP_BGRW =                       0x18000810

scolor = SK6812_STRIP_GRBW

# globals
led_count       = 167       # Number of LED pixels.
led_offset      = 0         # Degrees to offset the theta position 0-360 (float)
rho             = 0         # 0.0-1.0
theta           = 0
photo           = 0         # 0-1023
primary_color   = Color(1,1,255,1);
secondary_color = Color(255,1,1,1);

old_photo       = 0 # to reduce recreation of colors

# on quit
def signal_handler(sig, frame):
    print('You pressed Ctrl+C!')
    print("-" * 20)
    print("Shutting down...")
    server.close()
    colorWipe(strip, Color(0,0,0,0), 10) # clear lights regardless of -c flag
    fill(strip, Color(0,0,0,0))
    strip.show()
    print("Done")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

# Main program logic follows:
if __name__ == '__main__':
    # Process arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-c', '--clear', action='store_true', help='clear the display on exit')
    parser.add_argument('-n', '--n', help='number of pixels in LED strip', type=int)
    args = parser.parse_args()

    # Set led_count based on argument 0 if passed
    if args.n:
        print "LED Count {0}\n".format(args.n)
        led_count = args.n

    # Create NeoPixel object with appropriate configuration.
    strip = Adafruit_NeoPixel(led_count, LED_PIN, LED_FREQ_HZ, LED_DMA, LED_INVERT, LED_BRIGHTNESS, LED_CHANNEL, scolor)
    # Intialize the library (must be called once before other functions).
    strip.begin()

    print ('Press Ctrl-C to quit.')
    if not args.clear:
        print('Use "-c" argument to clear LEDs on exit')

    try:
        colorWipe(strip, primary_color, 10)  # Primary wipe just to get started
        colorWipe(strip, Color(0,0,0,0), 10)  # Erase wipe to clear
        # finished

    except KeyboardInterrupt:
        if args.clear:
            colorWipe(strip, Color(0,0,0,0), 10)
