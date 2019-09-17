#!/usr/bin/env python3
# Solid
# Author: Matthew Klundt (matt@withease.io)
#
# Show Primary Color

from neopixel import *
from timeit import default_timer as timer
import sys

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

def init(theta, rho):
    global transition, time_start
    time_start = 0
    transition = 0
    # print "Init solid pattern {0} {1}\n".format(time_start, transition),
    sys.stdout.flush()

def fill(strip, color):
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)

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
        # print "Start solid timer {0}\n".format(time_start),
        sys.stdout.flush()

    if transition < 1.0:
        for i in range(strip.numPixels()+1):
            strip.setPixelColor(i, colorBlend(strip.getPixelColor(i),primary_color,easeOut(transition)))
    else:
        fill(strip, primary_color) # fill with color
    strip.show()

    # increment time
    if transition < 1.0:
        time_end = timer()
        transition += time_end - time_start
        time_start = time_end
