#!/usr/bin/env python3
# Fade
# Author: Matthew Klundt (matt@withease.io)
#
# Fade between primary/secondary color based on rho of Sisyphus ball

from neopixel import *
from timeit import default_timer as timer
import sys

from colorFunctions import fill
from colorFunctions import colorBlend
from easing import easeOut

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

def init(theta, rho):
    global transition, time_start
    time_start = 0
    transition = 0
    # print "Init fade pattern {0} {1}\n".format(time_start, transition),
    sys.stdout.flush()

def update(theta, rho, photo, primary_color, secondary_color, strip):
    global transition, time_start
    if time_start == 0:
        time_start = timer()
        transition = 0
        # print "Start fade timer {0}\n".format(time_start),
        sys.stdout.flush()

    percent = rho
    if transition < 1.0:
        for i in range(strip.numPixels()+1):
            strip.setPixelColor(i, colorBlend(strip.getPixelColor(i),colorBlend(secondary_color,primary_color,percent),easeOut(transition)))
    else:
        fill(strip, colorBlend(secondary_color,primary_color,percent)) # fill with color based on rho only

    strip.show()

    # increment time
    if transition < 1.0:
        time_end = timer()
        transition += time_end - time_start
        time_start = time_end
