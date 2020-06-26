#!/usr/bin/env python3
# Tilt
# Author: Matthew Klundt (matt@withease.io)
#
# Pattern for the tilt controller

from neopixel import *
from timeit import default_timer as timer
import sys

from colorFunctions import fill
from colorFunctions import colorBlend
from easing import easeOut

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

zero_color = Color(0,0,255)

def init(theta, rho):
    global transition, time_start
    time_start = 0
    transition = 0
    # print "Init solid pattern {0} {1}\n".format(time_start, transition),
    sys.stdout.flush()

def update(theta, rho, photo, primary_color, secondary_color, balls, strip):
    global transition, time_start, zero_color
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

        led_count = strip.numPixels()

        # color the side of the table that you should be standing on for proper tilt orientation
        strip.setPixelColor(0, colorBlend(zero_color,primary_color,1))
        strip.setPixelColor(1, colorBlend(zero_color,primary_color,0.75))
        strip.setPixelColor(led_count-1, colorBlend(zero_color,primary_color,0.75))
        strip.setPixelColor(2, colorBlend(zero_color,primary_color,0.5))
        strip.setPixelColor(led_count-2, colorBlend(zero_color,primary_color,0.5))
        strip.setPixelColor(3, colorBlend(zero_color,primary_color,0.25))
        strip.setPixelColor(led_count-3, colorBlend(zero_color,primary_color,0.25))
        strip.setPixelColor(4, colorBlend(zero_color,primary_color,0.15))
        strip.setPixelColor(led_count-4, colorBlend(zero_color,primary_color,0.15))
        strip.setPixelColor(5, colorBlend(zero_color,primary_color,0.1))
        strip.setPixelColor(led_count-5, colorBlend(zero_color,primary_color,0.1))
        strip.setPixelColor(6, colorBlend(zero_color,primary_color,0.05))
        strip.setPixelColor(led_count-6, colorBlend(zero_color,primary_color,0.05))

    # increment time
    if transition < 1.0:
        time_end = timer()
        transition += time_end - time_start
        time_start = time_end
