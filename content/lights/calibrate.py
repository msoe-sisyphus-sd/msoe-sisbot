#!/usr/bin/env python3
# Calibrate
# Author: Matthew Klundt (matt@withease.io)
#
# Use for matching the ball position to theta

from neopixel import *
from math import pow
from timeit import default_timer as timer
import sys

from colorFunctions import fill
from colorFunctions import colorBlend
from easing import easeIn

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

def init(theta, rho):
    global transition, time_start
    time_start = 0
    transition = 0
    # print "Init solid pattern {0} {1}\n".format(time_start, transition),
    sys.stdout.flush()

def update(theta, rho, photo, primary_color, secondary_color, strip):
    global transition, time_start
    if time_start == 0:
        time_start = timer()
        transition = 0
        # print "Start calibrate timer {0}\n".format(time_start),
        sys.stdout.flush()

    led_count = strip.numPixels()

    # assign h_theta
    h_theta = theta

    brightness = int(255 * (photo / 1024)) + 1

    # color of non-pixels
    bg_color = Color(0,0,0,0)

    # color of spread by ball
    ball_color = Color(128,128,128,128)

    # spread out the pixel color based on total lights
    spread = 10    # spread over 15 degrees
    spread_l = h_theta - spread
    spread_r = h_theta + spread

    fill(strip, bg_color) # default color

    start = int( (spread_l * led_count) / 360 )
    end = int( (spread_r * led_count) / 360 ) + 1
    if (end < start):
        end += led_count

    h_fixed = h_theta % 360

    # print "Rho %s, Theta %s, Adjusted Theta %s, Photo %s, Brightness %s 0.5 %s 0.25 %s\n" % (rho, theta, h_theta, photo, brightness, max(int(brightness/2),1), max(int(brightness/4),1)),
    # sys.stdout.flush()

    for x in range(start, end):
        pos = x % led_count
        degrees = (float(pos * 360) / led_count)

        # fix wrapping degrees
        if (degrees > h_fixed + 180):
            degrees -= 360
        elif (degrees < h_fixed - 180):
            degrees += 360

        # if (degrees >= spread_l and degrees <= spread_r):
        # ramp brightness
        t = abs(h_fixed - degrees) / spread


        # update blend, it is given linear, but needs to be logarithmic(?)
        percent = easeIn(t) # choose an ease function from above

        # print "pos {0} ( {1} - {2} ) / {3}, percent {4}\n".format(pos, h_fixed, degrees, spread, t),
        # sys.stdout.flush()

        strip.setPixelColor(pos, colorBlend(ball_color,bg_color,percent))
        # strip.setPixelColor(pos, ball_color)
    strip.show()

    # increment time
    if transition < 1.0:
        time_end = timer()
        transition += time_end - time_start
        time_start = time_end
