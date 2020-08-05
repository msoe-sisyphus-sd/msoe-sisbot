#!/usr/bin/env python3
# Strobe
# Author: Matthew Klundt (matt@withease.io)
#
# Flash lights at a rate

from neopixel import *
from timeit import default_timer as timer
import sys

from colorFunctions import fill
from colorFunctions import colorBlend
from easing import easeOut

time_start = 0 # for elapsed time
current_time = 0 # 0-1.0, fade between states

off_time = 1 # how long between lights on
on_time = 0.1 # how long for lights to stay on

def init(start_theta, start_rho):
    global current_time, time_start
    current_time = 0
    time_start = 0
    # print "Init white pattern {0} {1}\n".format(time_start, current_time),
    # sys.stdout.flush()

def update(theta, rho, photo, primary_color, secondary_color, balls, strip):
    global current_time, time_start, off_time, on_time
    if time_start == 0:
        time_start = timer()
        current_time = 0
        # print "Start white timer {0}\n".format(time_start),
        # sys.stdout.flush()

    if current_time > off_time:
        for i in range(strip.numPixels()+1):
            strip.setPixelColor(i, primary_color)
    else:
        fill(strip, Color(0,0,0,0)) # turn all off

    # increment time
    time_end = timer()
    current_time += time_end - time_start
    while current_time >= off_time + on_time:
        current_time -= off_time + on_time
    time_start = time_end
