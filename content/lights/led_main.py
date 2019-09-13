#!/usr/bin/env python3
# Sisyphus NeoPixel Pattern Controller
# Author: Matthew Klundt (matt@withease.io)
#
# Runs socket for LED data to match patterns with ball position on Sisyphus Industries LLC tables.

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
led_count       = 100       # Number of LED pixels.
led_offset      = 0         # Degrees to offset the theta position 0-360 (float)
rho             = 0         # 0.0-1.0
theta           = 0
photo           = 0         # 0-1023
primary_color   = Color(1,1,1,64);
secondary_color = Color(1,1,1,1);

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


def init_socket(socket_path):
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

# Import a new pattern, which will overwrite the function update()
def dynamic_import(abs_module_path, class_name):
    module_object = import_module(abs_module_path)
    target_class = getattr(module_object, class_name, no_init)
    return target_class

def no_init(start_rho, start_theta):
    pass # default: do nothing

def init(start_rho, start_theta):
    pass # default: do nothing

# Define functions which animate LEDs in various ways.
def colorWipe(strip, color, wait_ms=50):
    """Wipe color across display a pixel at a time."""
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)
        strip.show()
        time.sleep(wait_ms/1000.0)

def wheel(pos):
    # print "wheel %s\n" % (pos),
    """Generate rainbow colors across 0-255 positions."""
    if pos < 85:
        return Color(pos * 3, 255 - pos * 3, 0)
    elif pos < 170:
        pos -= 85
        return Color(255 - pos * 3, 0, pos * 3)
    else:
        pos -= 170
        return Color(0, pos * 3, 255 - pos * 3)

def colorBlend(color1,color2,blend=0):
    if (blend > 1):
        blend = 1
    if (blend < 0):
        blend = 0
    # Fade color1 into color2 by blend percent
    w1 = (color1 >> 24) & 0xFF;
    r1 = (color1 >> 16) & 0xFF;
    g1 = (color1 >> 8) & 0xFF;
    b1 = color1 & 0xFF;
    w2 = (color2 >> 24) & 0xFF;
    r2 = (color2 >> 16) & 0xFF;
    g2 = (color2 >> 8) & 0xFF;
    b2 = color2 & 0xFF;
    red = int(r1+(r2-r1)*blend)
    green = int(g1+(g2-g1)*blend)
    blue = int(b1+(b2-b1)*blend)
    white = int(w1+(w2-w1)*blend)
    return Color(red,green,blue,white)

def easeIn(t):
    if t > 1.0:
        t = 1.0
    elif t < 0:
        t = 0
    return 1.0 - pow(2, (1.0 - t) * 10.0) / 1024.0

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

    server = init_socket('/tmp/sisyphus_sockets')

    print ('Press Ctrl-C to quit.')
    if not args.clear:
        print('Use "-c" argument to clear LEDs on exit')

    # load default python script
    update = dynamic_import("white", "update")

    try:
        # colorWipe(strip, white_color,10)  # White wipe just to get started

        # fade to white
        white_color = Color(1, 1, 1, 255)
        fill(strip, white_color)
        strip.setBrightness(1)
        strip.show()

        fade_time = 0
        fade_total = 256
        while fade_time < fade_total:
            strip.setBrightness(fade_time)
            strip.show()
            time.sleep(5/1000.0)
            fade_time += 1

        # fade to color
        start_color = wheel(0)
        fade_time = 0
        fade_total = 128.0
        while fade_time < fade_total:
            fill(strip, colorBlend(white_color, start_color, easeIn(fade_time/fade_total)))
            strip.show()
            time.sleep(10/1000.0)
            fade_time += 1

        startup = 0
        while startup<256:
            fill(strip, wheel(startup)) # Cycle through colors as a means of startup
            strip.show()
            time.sleep(10/1000.0)
            startup += 1

        # fade out
        end_color = wheel(255)
        fade_time = 0
        fade_total = 256
        while fade_time < fade_total:
            strip.setBrightness(255-fade_time)
            strip.show()
            time.sleep(5/1000.0)
            fade_time += 1

        # off all colors
        fill(strip, Color(0,0,0,0))
        strip.show()

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
                    # init the pattern
                    init = dynamic_import(filename, "init")
                    init(theta * 57.2958 + led_offset, rho)
                    # change update function
                    update = dynamic_import(filename, "update")
                else:
                    print "command %s\n" % (command),
                    sys.stdout.flush()

            # update brightness, if changed
            if photo != old_photo:
                brightness = 0
                if photo >= 1023:
                    brightness = 255
                elif photo > 0:
                    adjustment = pow(2,(1-(photo/1023))*10)/256+1
                    brightness = int(round(photo/1023*adjustment*255)) # int(round(photo/1023.0*255))
                # print "Brightness {0} => {1} {2}\n".format(photo, brightness, strip.getBrightness()),
                # sys.stdout.flush()
                strip.setBrightness(brightness)

            # update, regardless of socket_data
            update(theta * 57.2958 + led_offset, rho, photo, primary_color, secondary_color, strip)
            # time.sleep(1.0/60.0) # sixty frames/sec

            old_photo = photo;

    except KeyboardInterrupt:
        if args.clear:
            colorWipe(strip, Color(0,0,0,0), 10)
