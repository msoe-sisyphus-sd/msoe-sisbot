#!/usr/bin/env python3
# Rainbow
# Author: Matthew Klundt (matt@withease.io)
#
# Fade between primary/secondary color based on rho of Sisyphus ball

from neopixel import *
from timeit import default_timer as timer
import sys

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

def init(theta, rho):
    global transition, time_start
    time_start = 0
    transition = 0
    # print "Init rainbow pattern {0} {1}\n".format(time_start, transition),
    sys.stdout.flush()

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

def easeOut(t):
    return pow(2, t * 10.0) / 1024.0

def update(theta, rho, photo, primary_color, secondary_color, strip):
    global transition, time_start
    if time_start == 0:
        time_start = timer()
        transition = 0
        # print "Start rainbow timer {0}\n".format(time_start),
        sys.stdout.flush()

    led_count = strip.numPixels()

    # offset of rainbow
    wheel_deg = int((-theta%360) / 360 * 255)
    # print "theta %s = %s \n" % (theta, wheel_deg),

    for i in range(0,led_count):
        pixel_offset = float(i)/led_count*255.0
        offset = (int(pixel_offset)+wheel_deg) & 255;
        # print "%d wheel_deg %s degrees + pixel_offset %s = %s \n" % (i, wheel_deg, pixel_offset, offset),
        if transition < 1.0:
            strip.setPixelColor(i, colorBlend(strip.getPixelColor(i), wheel(offset),easeOut(transition)))
        else:
            strip.setPixelColor(i, wheel(offset))

    strip.show()

    # increment time
    if transition < 1.0:
        time_end = timer()
        transition += time_end - time_start
        time_start = time_end
