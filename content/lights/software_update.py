#!/usr/bin/env python3
# Software Update
# Author: Matthew Klundt (matt@withease.io)
#
# Breathing colors for software update

from neopixel import *
from math import sin
from timeit import default_timer as timer
import sys

from colorFunctions import fill
from colorFunctions import colorBlend
from easing import easeOut

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

breathe_fade = 0
blue = Color(0,0,255,0)
white = Color(0,0,0,255)

def init(theta, rho):
    global transition, time_start
    time_start = 0
    transition = 0
    # print "Init software_update pattern {0} {1}\n".format(time_start, transition),
    sys.stdout.flush()

def update(theta, rho, photo, primary_color, secondary_color, balls, strip):
    global transition, time_start, breathe_fade, blue, white
    if time_start == 0:
        time_start = timer()
        transition = 0
        # print "Start software_update timer {0}\n".format(time_start),
        sys.stdout.flush()

    percent = 0.5 + sin(breathe_fade) * 0.5
    if transition < 1.0:
        for i in range(strip.numPixels()+1):
            strip.setPixelColor(i, colorBlend(strip.getPixelColor(i),colorBlend(white,blue,percent),easeOut(transition)))
    else:
        fill(strip, colorBlend(white,blue,percent)) # fill with color based on rho only

    breathe_fade += 0.005

    # increment time
    if transition < 1.0:
        time_end = timer()
        transition += time_end - time_start
        time_start = time_end
