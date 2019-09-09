#!/usr/bin/env python3
# Spread
# Author: Matthew Klundt (matt@withease.io)
#
# Comet trail to follow the ball around

from neopixel import *
import sys

h_theta = 0 # head theta
h_r = 5 # head radius (in lights)
h_easing = 0.9 # head easing
t_theta = 0 # tail theta (offset from h_theta)
t_r = 5 # tail radius (in lights)
t_easing = 0.125 # tail easing

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

def easeIn(t):
    if t > 1.0:
        t = 1.0
    elif t < 0:
        t = 0
    return 1.0 - pow(2, (1.0 - t) * 10.0) / 1024.0

def update(rho, theta, photo, primary_color, secondary_color, strip):
    global h_theta,h_r,h_easing,t_theta,t_r,t_easing

    led_count = strip.numPixels()

    # color of non-pixels
    bg_color = secondary_color
    # color of comet by ball
    ball_color = primary_color
    tail_color = colorBlend(ball_color, bg_color, easeIn(0.5))

    fill(strip, bg_color) # default color

    elapsed = 1.0/60.0 # assume correct timing

    # ease h_theta into theta
    if (h_easing < 1.0):
        dh = (theta - h_theta) * h_easing # target - current
        h_theta += dh * elapsed
    else:
        h_theta = theta

    # ease t_theta into theta
    dt = (h_theta - t_theta) * t_easing
    t_theta += dt * elapsed

    # fix flashing of ball trying to catch up to big theta
    h_diff = h_theta - theta
    if abs(h_diff) >= 180:
        h_theta = theta
    diff = h_theta - t_theta
    if abs(diff) >= 360: # reset tail if falling too far behind
        t_theta = h_theta

    # solid positions
    h_x = int( (h_theta * led_count) / 360 )
    t_x = int( (t_theta * led_count) / 360 )

    h_fixed = h_theta % 360
    t_fixed = t_theta % 360
    spread = diff

    # head positions
    h_spread = 360 / led_count * h_r
    h_start = h_x - h_r
    h_end = h_x + h_r

    # tail positions
    t_spread = 360 / led_count * t_r
    t_start = t_x - t_r
    t_end = t_x + t_r

    # fade light by tail
    t_diff = max(abs(t_x - t_r - h_end), abs(t_x + t_r - h_start))
    if t_diff > h_r:
        for x in range(t_start, t_end):
            pos = x % led_count
            degrees = (float(x * 360) / led_count)

            t = abs((t_theta - degrees) / t_spread)
            percent = easeIn(t) # choose an ease function from above

            strip.setPixelColor(pos, colorBlend(tail_color,bg_color,percent))

    # fade light by ball
    for x in range(h_start, h_end):
        pos = x % led_count
        degrees = (float(x * 360) / led_count)

        t = abs((h_theta - degrees) / h_spread)
        percent = easeIn(t) # choose an ease function from above

        strip.setPixelColor(pos, colorBlend(ball_color,bg_color,percent))

    # fade between ball-tail
    if spread != 0:
        start = h_x-1
        end = t_x+1
        if h_x > t_x: # reverse order if head is greater
            start = t_x-1
            end = h_x+1
        for x in range(start, end):
            pos = x % led_count
            degrees = (float(x * 360) / led_count)

            t = abs((h_theta - degrees) / spread)
            if t <= 1.0 and t > 0:
                percent = t # linear ease, I want this to be apparent

                strip.setPixelColor(pos, colorBlend(ball_color,tail_color,percent))

    # print "Theta %s, Head %s, Tail %s\n" % (theta, h_x, t_x),
    # sys.stdout.flush()

    strip.show()
