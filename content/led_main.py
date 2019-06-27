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

# LED strip configuration:
LED_COUNT      = 100      # Number of LED pixels.
LED_OFFSET     = 0      # Degrees to offset the theta position
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
rho = 0 # 0.0-1.0
theta = 0
photo = 0 # 0-1023

primary_color = Color(18,1,1,1);
secondary_color = Color(1,1,18,1);

h_theta = 0 # wanted ball position
easing = 0.95 # easing for ball

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

# Define functions which animate LEDs in various ways.
def adjustBrightness(color, *args):
    """Adjust brightness of color based on args. (all)|(r,g,b,w)"""
    if (len(args) >= 4):
        blend_r = args[0] / 255.0
        blend_g = args[1] / 255.0
        blend_b = args[2] / 255.0
        blend_w = args[3] / 255.0

        white = (color >> 24) & 0xFF;
        red = (color >> 16) & 0xFF;
        green = (color >> 8) & 0xFF;
        blue = color & 0xFF;

        return Color(int(red*blend_r),int(green*blend_g),int(blue*blend_b),int(white*blend_w))

    elif (len(args) >= 1):
        blend = args[0] / 255.0

        white = (color >> 24) & 0xFF;
        red = (color >> 16) & 0xFF;
        green = (color >> 8) & 0xFF;
        blue = color & 0xFF;

        return Color(int(red*blend),int(green*blend),int(blue*blend),int(white*blend))

    return color

def colorWipe(strip, color, wait_ms=50):
    """Wipe color across display a pixel at a time."""
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)
        strip.show()
        time.sleep(wait_ms/1000.0)

def fill(strip, color):
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)

def colorBlend(color1,color2,blend=0):
    if (blend > 1):
        # print "blend %s out of range" % (blend)
        # sys.stdout.flush()
        blend = 1
    if (blend < 0):
        # print "blend %s out of range" % (blend)
        # sys.stdout.flush()
        blend = 0
    """Fade color1 into color2 by blend percent"""
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

def linear(t):
    return t

def easeInQuad(t):
    return t*t

def easeOutQuad(t):
    return t*(2-t)

def easeInOutQuad(t):
    if t<.5:
        return 2*t*t
    return -1+(4-2*t)*t

def easeInCubic(t):
    return t*t*t

def easeOutCubic(t):
    t-=1
    return t*t*t+1

def easeInOutCubic(t):
    if t<0.5:
        return 4*t*t*t
    return (t-1)*(2*t-2)*(2*t-2)+1

def easeInQuart(t):
    return t*t*t*t

def easeOutQuart(t):
    t-=1
    return 1-t*t*t*t

def easeInOutQuart(t):
    if t<.5:
        return 8*t*t*t*t
    t-=1
    return 1-8*t*t*t*t

def easeInQuint(t):
    return t*t*t*t*t

def easeOutQuint(t):
    t-=1
    return 1+t*t*t*t*t

def easeInOutQuint(t):
    if t<.5:
        return 16*t*t*t*t*t
    t-=1
    return 1+16*t*t*t*t*t

def update(rho, theta, photo, strip):
    global start, h_theta, easing, primary_color, secondary_color

    # calc theta in degrees
    deg = theta * 57.2958
    deg += LED_OFFSET
    deg = abs(360-deg) # invert direction

    # assign h_theta
    h_theta = deg

    brightness = int(255 * (photo / 1024)) + 1

    # color of non-pixels
    # bg_color = adjustBrightness(secondary_color, brightness)
    bg_color = secondary_color

    # color of spread by ball
    # ball_color = adjustBrightness(primary_color, brightness)
    ball_color = primary_color

    # spread out the pixel color based on rho
    max_spread = 75 # degress on either side of pixel to spread white
    min_spread = 15 # degress on either side of pixel to spread white
    spread = max_spread - (max_spread * rho) + min_spread
    # spread = 45 # force to specific width
    spread_l = h_theta - spread
    spread_r = h_theta + spread

    fill(strip, bg_color) # default color

    start = int( (spread_l * LED_COUNT) / 360 )
    end = int( (spread_r * LED_COUNT) / 360 ) # + 1
    if (end < start):
        end += LED_COUNT

    h_fixed = h_theta % 360

    # print "Rho %s, Theta %s, Adjusted Theta %s, Photo %s, Brightness %s 0.5 %s 0.25 %s\n" % (rho, theta, h_theta, photo, brightness, max(int(brightness/2),1), max(int(brightness/4),1)),
    # sys.stdout.flush()

    for x in range(start, end):
        pos = x % LED_COUNT
        degrees = (float(pos * 360) / LED_COUNT)

        # fix wrapping degrees
        if (degrees > h_fixed + 180):
            degrees -= 360
        elif (degrees < h_fixed - 180):
            degrees += 360

        # if (degrees >= spread_l and degrees <= spread_r):
        # ramp brightness
        t = abs(h_fixed - degrees) / spread
        percent = easeInQuad(t) # choose an ease function from above
        # print "pos %s ( %s - %s ) / %s, percent %s\n" % (pos, h_fixed, degrees, spread, t),
        # sys.stdout.flush()

        strip.setPixelColor(pos, colorBlend(ball_color,bg_color,percent))
        # strip.setPixelColor(pos, ball_color)
    strip.show()

# Main program logic follows:
if __name__ == '__main__':
    # Process arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-c', '--clear', action='store_true', help='clear the display on exit')
    args = parser.parse_args()

    # Create NeoPixel object with appropriate configuration.
    strip = Adafruit_NeoPixel(LED_COUNT, LED_PIN, LED_FREQ_HZ, LED_DMA, LED_INVERT, LED_BRIGHTNESS, LED_CHANNEL, scolor)
    # Intialize the library (must be called once before other functions).
    strip.begin()

    server = init('/tmp/sisyphus_sockets')

    print ('Press Ctrl-C to quit.')
    if not args.clear:
        print('Use "-c" argument to clear LEDs on exit')

    try:
	fill(strip, Color(1,1,1,1))
	strip.show()
        colorWipe(strip, Color(1, 32, 32, 16),50)  # Green wipe just to get started

        #  Loop and get incoming data from plotter
        while True:
            bytes = get_data(server)
            if bytes > 0:
                command = socket_bytes[0]

                if command == 98: # b: ball data
                    [rho] = struct.unpack_from('>f', socket_bytes, 1)
                    [theta] = struct.unpack_from('>f', socket_bytes, 5)
                    [photo] = struct.unpack_from('>f', socket_bytes, 9)
                elif command == 67: # C: primary color data
                    # [red] = struct.unpack_from('>B', socket_bytes, 1)
                    # [green] = struct.unpack_from('>B', socket_bytes, 2)
                    # [blue] = struct.unpack_from('>B', socket_bytes, 3)
                    # [white] = struct.unpack_from('>B', socket_bytes, 4)
                    print "Primary color \n",
                    sys.stdout.flush()
                elif command == 99: # c: secondary color data
                    # [red] = struct.unpack_from('>B', socket_bytes, 1)
                    # [green] = struct.unpack_from('>B', socket_bytes, 2)
                    # [blue] = struct.unpack_from('>B', socket_bytes, 3)
                    # [white] = struct.unpack_from('>B', socket_bytes, 4)
                    print "Secondary color \n",
                    sys.stdout.flush()
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
                    print "offset...\n",
                    sys.stdout.flush()
                elif command == 105: # i: import
                    print "import...\n",
                    sys.stdout.flush()
                else:
                    print "command %s\n" % (command),
                    sys.stdout.flush()

            # update, regardless of socket_data
            update(rho, theta, photo, strip)
            # time.sleep(1.0/60.0) # sixty frames/sec

    except KeyboardInterrupt:
        if args.clear:
            colorWipe(strip, Color(0,0,0,0), 10)
