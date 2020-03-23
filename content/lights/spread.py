#!/usr/bin/env python3
# Spread
# Author: Matthew Klundt (matt@withease.io)
#
# Spread of color pixels around the position of Sisyphus ball

from neopixel import *
from timeit import default_timer as timer
import sys

from colorFunctions import fill
from colorFunctions import colorBlend
from easing import easeOut
from easing import easeInQuad

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

def init(theta, rho):
    global transition, time_start
    time_start = 0
    transition = 0
    # print "Init spread pattern {0} {1}\n".format(time_start, transition),
    sys.stdout.flush()

def update(theta, rho, photo, primary_color, secondary_color, balls, strip):
    global transition, time_start
    if time_start == 0:
        time_start = timer()
        transition = 0
        # print "Start spread timer {0}\n".format(time_start),
        sys.stdout.flush()

    led_count = strip.numPixels()

    # assign h_theta
    h_theta = theta

    # color of non-pixels
    bg_color = secondary_color

    # color of spread by ball
    ball_color = primary_color

    # spread out the pixel color based on rho
    max_spread = 85 # degress on either side of pixel to spread white
    min_spread = 10 # degress on either side of pixel to spread white
    spread = max_spread - (max_spread * rho) + min_spread
    # spread = 45 # force to specific width
    spread_l = h_theta - spread
    spread_r = h_theta + spread

    start = int( (spread_l * led_count) / 360 )
    end = int( (spread_r * led_count) / 360 ) + 1
    if (end < start):
        end += led_count

    h_fixed = h_theta % 360

    if transition < 1.0:
        for i in range(strip.numPixels()+1):
            if i < start%led_count or i > end%led_count:
                strip.setPixelColor(i, colorBlend(strip.getPixelColor(i),bg_color,easeOut(transition)))
    else:
        fill(strip, bg_color) # default color

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

        # ramp brightness
        t = abs(h_fixed - degrees) / spread
        percent = easeInQuad(t) # choose an ease function from above

        # print "pos {0} ( {1} - {2} ) / {3}, percent {4}\n".format(pos, h_fixed, degrees, spread, t),
        # sys.stdout.flush()

        if transition < 1.0:
            strip.setPixelColor(pos, colorBlend(strip.getPixelColor(pos),colorBlend(ball_color,bg_color,percent),easeOut(transition)))
        else:
            strip.setPixelColor(pos, colorBlend(ball_color,bg_color,percent))

    # increment time
    if transition < 1.0:
        time_end = timer()
        transition += time_end - time_start
        time_start = time_end
