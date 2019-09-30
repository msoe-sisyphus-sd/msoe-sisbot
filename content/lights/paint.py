#!/usr/bin/env python3
# Paint
# Author: Matthew Klundt (matt@withease.io)
#
# Spread of color pixels around the position of Sisyphus ball

from neopixel import *
from timeit import default_timer as timer
from math import sin
import sys

from colorFunctions import colorBlend
from colorFunctions import wheel
from easing import easeIn

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

color_pos = 0 # sine wave angle for modifying color
color_range = 0.2 # radius of sine curve (full is 1.0)
color_speed = 0.1 # how fast will we move through sine wave

no_color = Color(0,0,0,0) # off color

def init(theta, rho):
    global transition, time_start
    time_start = 0
    transition = 0
    # print "Init spread pattern {0} {1}\n".format(time_start, transition),
    sys.stdout.flush()

def update(theta, rho, photo, primary_color, secondary_color, strip):
    global transition, time_start, color_pos, color_range, color_speed, no_color

    if time_start == 0:
        time_start = timer()
        transition = 0
        # print "Start spread timer {0}\n".format(time_start),
        sys.stdout.flush()

    led_count = strip.numPixels()

    # assign h_theta
    h_theta = theta

    # increment sine wave
    # value = rho + sin(color_pos) * color_range;
    # if value < 0: # wrap
    #     value += 256

    # print "Rho %s, Wheel %s\n" % (rho, int(value*255)%255),
    # sys.stdout.flush()

    # color of spread by ball
    ball_color = wheel(int(rho*255)) # change based on rho
    # ball_color = colorBlend(primary_color, secondary_color, rho) # blend between primary/secondary based on rho
    # ball_color = wheel(int(value*255)%255) # change based on rho + sine wave variation

    # spread out the pixel color based on rho
    # max_spread = 85 # degress on either side of pixel to spread white
    # min_spread = 10 # degress on either side of pixel to spread white
    # spread = max_spread - (max_spread * rho) + min_spread
    spread = 15 # force to specific width
    spread_l = h_theta - spread
    spread_r = h_theta + spread

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

        # ramp brightness
        t = abs(h_fixed - degrees) / spread

        if t > 0 and t <= 1.0:
            percent = easeIn(t) # choose an ease function from above
            strip.setPixelColor(pos, colorBlend(ball_color,strip.getPixelColor(pos),percent))

            # print "pos {0} ( {1} - {2} ) / {3}, percent {4}\n".format(pos, h_fixed, degrees, spread, t),
            # sys.stdout.flush()

    strip.show()

    # increment time
    time_end = timer()
    if transition < 1.0:
        transition += time_end - time_start
    # color_pos += (time_end - time_start) * color_speed;
    time_start = time_end
