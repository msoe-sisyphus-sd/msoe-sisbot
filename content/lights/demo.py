#!/usr/bin/env python3
# Demo
# Author: Matthew Klundt (matt@withease.io)
#
# Loops through: white, fade to color(s), spread, rainbow

from neopixel import *
from timeit import default_timer as timer
from random import randrange
import sys

state = 0 # 0-3, white, color, spread, rainbow
length = 20 # seconds to wait between patterns
time_start = 0 # for elapsed time
time = 0 # time in seconds to count
transition = 0 # 0-1.0, fade between states

current_primary = Color(255,255,255,255) # start off
current_secondary = Color(0,0,0,0) # start off

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

def easeQuad(t):
    return t*t

def easeOut(t):
    return pow(2, t * 10.0) / 1024.0

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

def update(rho, theta, photo, primary_color, secondary_color, strip):
    global state, transition, current_primary, current_secondary, time, time_start, length
    if time_start == 0:
        time_start = timer()
        fill(strip, Color(0,0,0,0))

    led_count = strip.numPixels()

    # draw current state
    if state == 0: #white
        if transition < 1.0:
            for i in range(strip.numPixels()+1):
                strip.setPixelColor(i, colorBlend(strip.getPixelColor(i),current_primary,easeOut(transition)))
        else:
            fill(strip, current_primary) # default color
    elif state == 1: # color
        if transition < 1.0:
            for i in range(strip.numPixels()+1):
                strip.setPixelColor(i, colorBlend(strip.getPixelColor(i),current_primary,easeOut(transition)))
        else:
            fill(strip, current_primary) # default color
    elif state == 2: # spread
        # spread out the pixel color based on rho
        max_spread = 85 # degress on either side of pixel to spread white
        min_spread = 10 # degress on either side of pixel to spread white
        spread = max_spread - (max_spread * rho) + min_spread
        spread_l = theta - spread
        spread_r = theta + spread

        start = int( (spread_l * led_count) / 360 )
        end = int( (spread_r * led_count) / 360 ) + 1
        if (end < start):
            end += led_count

        if transition < 1.0:
            for i in range(strip.numPixels()+1):
                if i < start%led_count or i > end%led_count:
                    strip.setPixelColor(i, colorBlend(strip.getPixelColor(i),current_secondary,easeOut(transition)))
        else:
            fill(strip, current_secondary) # default color

        h_fixed = theta % 360

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

            if transition < 1.0:
                strip.setPixelColor(pos, colorBlend(strip.getPixelColor(pos),colorBlend(current_primary,current_secondary,percent),easeOut(transition)))
            else:
                strip.setPixelColor(pos, colorBlend(current_primary,current_secondary,percent))
    else: # rainbow
        # offset of rainbow
        wheel_deg = int((-theta%360) / 360 * 255)
        for i in range(0,led_count):
            pixel_offset = float(i)/led_count*255.0
            offset = (int(pixel_offset)+wheel_deg) & 255;
            if transition < 1.0:
                strip.setPixelColor(i, colorBlend(strip.getPixelColor(i), wheel(offset),easeOut(transition)))
            else:
                strip.setPixelColor(i, wheel(offset))

    strip.show()

    # increment time
    time_end = timer()
    time += time_end - time_start
    transition += time_end - time_start
    time_start = time_end

    # change states
    if time > length:
        time = 0
        transition = 0
        state += 1
        if state > 3:
            state = 0
            current_primary = Color(255,255,255,255)
        elif state == 1:
            # new color
            current_primary = wheel(randrange(256))
        elif state == 2:
            current_primary = Color(255,255,255,255)
            current_secondary = wheel(randrange(256))
        # print "State %s\n" % (state),
        # sys.stdout.flush()
