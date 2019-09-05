#!/usr/bin/env python3
# NeoPixel library strandtest example
# Author: Tony DiCola (tony@tonydicola.com)
#
# Direct port of the Arduino NeoPixel library strandtest example.  Showcases
# various animations on a strip of NeoPixels.

import time
from neopixel import *
import argparse
import sys
import socket
import fcntl, os
import errno
import signal
import struct # convert bytest to float
from importlib import import_module

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
server = None

socket_bytes = bytearray(256)

# globals
led_count       = 100      # Number of LED pixels.
led_offset      = 0      # Degrees to offset the theta position 0-360 (float)
rho             = 0 # 0.0-1.0
theta           = 0
photo           = 0 # 0-1023
primary_color   = Color(1,1,1,18);
secondary_color = Color(1,1,1,18);

actual_primary_color   = Color(1,1,1,18); # incorporates brightness
actual_secondary_color = Color(1,1,1,18); # incorporates brightness
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
    os.remove("/tmp/sisyphus_sockets")
    print("Done")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)


def init(socket_path):
    if os.path.exists(socket_path):
        os.remove(socket_path)
    print("Opening socket...")
    server = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    server.bind(socket_path)
    fcntl.fcntl(server, fcntl.F_SETFL, os.O_NONBLOCK)
    return server

def get_data(server):
    try:
        nbytes, sender = server.recvfrom_into(socket_bytes)
    except socket.error, e:
        err = e.args[0]
        if err == errno.EAGAIN or err == errno.EWOULDBLOCK:
            # time.sleep(1.0/1000)
            # print 'No data available'
            return 0
        else:
            # a "real" error occurred
            print e
            sys.exit(1)
    else:
        if not nbytes:
            return -1
        else:
            return nbytes

def dynamic_import(abs_module_path, class_name):
    module_object = import_module(abs_module_path)
    target_class = getattr(module_object, class_name)
    return target_class

# Define functions which animate LEDs in various ways.
def brightness_adjust(color, photo):
    brightness = photo/1023.0
    w1 = (color >> 24) & 0xFF;
    r1 = (color >> 16) & 0xFF;
    g1 = (color >> 8) & 0xFF;
    b1 = color & 0xFF;
    return Color(int(r1*brightness),int(g1*brightness),int(b1*brightness),int(w1*brightness))

def colorWipe(strip, color, wait_ms=50):
    """Wipe color across display a pixel at a time."""
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)
        strip.show()
        time.sleep(wait_ms/1000.0)

def fill(strip, color):
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)

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

    server = init('/tmp/sisyphus_sockets')

    print ('Press Ctrl-C to quit.')
    if not args.clear:
        print('Use "-c" argument to clear LEDs on exit')

    # load default python script
    update = dynamic_import("white", "update")

    try:
	fill(strip, Color(1,1,1,1))
	strip.show()
        colorWipe(strip, Color(1, 32, 32, 16),10)  # Cyan wipe just to get started

        #  Loop and get incoming data from plotter
        while True:
            new_color = False # do we need to update actual_colors
            bytes = get_data(server)
            if bytes > 0:
                command = socket_bytes[0]

                if command == 98: # b: ball data
                    [rho] = struct.unpack_from('>f', socket_bytes, 1)
                    [theta] = struct.unpack_from('>f', socket_bytes, 5)
                    [photo] = struct.unpack_from('>f', socket_bytes, 9)
                elif command == 67: # C: primary color data
                    [red] = struct.unpack_from('>B', socket_bytes, 1)
                    [green] = struct.unpack_from('>B', socket_bytes, 2)
                    [blue] = struct.unpack_from('>B', socket_bytes, 3)
                    [white] = struct.unpack_from('>B', socket_bytes, 4)
                    primary_color = Color(red,green,blue,white)
                    print "Primary color {0} {1} {2} {3}\n".format(red,green,blue,white),
                    sys.stdout.flush()
                    new_color = True
                elif command == 99: # c: secondary color data
                    [red] = struct.unpack_from('>B', socket_bytes, 1)
                    [green] = struct.unpack_from('>B', socket_bytes, 2)
                    [blue] = struct.unpack_from('>B', socket_bytes, 3)
                    [white] = struct.unpack_from('>B', socket_bytes, 4)
                    secondary_color = Color(red,green,blue,white)
                    print "Secondary color {0} {1} {2} {3}\n".format(red,green,blue,white),
                    sys.stdout.flush()
                    new_color = True
                elif command == 104: # h: homing state
                    print "homing...\n",
                    sys.stdout.flush()
                elif command == 80: # P: playing state
                    print "Playing...\n",
                    sys.stdout.flush()
                elif command == 112: # p: paused state
                    print "paused...\n",
                    sys.stdout.flush()
                elif command == 115: # s: sleep state
                    print "sleep...\n",
                    sys.stdout.flush()
                elif command == 119: # w: wake state
                    print "wake...\n",
                    sys.stdout.flush()
                elif command == 111: # o: offset
                    [led_offset] = struct.unpack_from('>f', socket_bytes, 1)
                    print "offset... {0}\n".format(led_offset),
                    sys.stdout.flush()
                elif command == 105: # i: import
                    print "import {0}:".format(bytes),
                    load_file = str(socket_bytes.translate(None))
                    filename = load_file[1:bytes]
                    print filename
                    sys.stdout.flush()
                    update = dynamic_import(filename, "update")
                else:
                    print "command %s\n" % (command),
                    sys.stdout.flush()

            # update colors, if changed
            if photo != old_photo or new_color:
                # print "photo %4d : %6.4f\n" % (photo, photo/1023.0),
                actual_primary_color = brightness_adjust(primary_color, photo)
                actual_secondary_color = brightness_adjust(secondary_color, photo)

            # update, regardless of socket_data
            update(rho, theta * 57.2958 + led_offset, photo, actual_primary_color, actual_secondary_color, led_count, strip)
            # time.sleep(1.0/60.0) # sixty frames/sec

            old_photo = photo;

    except KeyboardInterrupt:
        if args.clear:
            colorWipe(strip, Color(0,0,0,0), 10)
