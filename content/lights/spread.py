#!/usr/bin/env python3
# Spread
# Author: Matthew Klundt (matt@withease.io)
#
# Spread of color pixels around the position of Sisyphus ball

from neopixel import *
from timeit import default_timer as timer
import sys

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

def init(theta, rho):
    global transition, time_start
    time_start = 0
    transition = 0
    # print "Init spread pattern {0} {1}\n".format(time_start, transition),
    sys.stdout.flush()

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

def easeQuad(t):
    return t*t

def easeIn(t):
    return 1.0 - pow(2, (1.0 - t) * 10.0) / 1024.0

def easeOut(t):
    return pow(2, t * 10.0) / 1024.0

def update(theta, rho, photo, primary_color, secondary_color, strip):
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
        percent = easeQuad(t) # choose an ease function from above

        # print "pos {0} ( {1} - {2} ) / {3}, percent {4}\n".format(pos, h_fixed, degrees, spread, t),
        # sys.stdout.flush()

        if transition < 1.0:
            strip.setPixelColor(pos, colorBlend(strip.getPixelColor(pos),colorBlend(ball_color,bg_color,percent),easeOut(transition)))
        else:
            strip.setPixelColor(pos, colorBlend(ball_color,bg_color,percent))
    strip.show()

    # increment time
    if transition < 1.0:
        time_end = timer()
        transition += time_end - time_start
        time_start = time_end
