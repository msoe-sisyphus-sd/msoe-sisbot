#!/usr/bin/env python3
# Spread
# Author: Matthew Klundt (matt@withease.io)
#
# Comet trail to follow the ball around

from neopixel import *
from timeit import default_timer as timer
import sys

from colorFunctions import fill
from colorFunctions import colorBlend
from easing import easeIn
from easing import easeOut

time_start = 0 # for elapsed time
transition = 0 # 0-1.0, fade between states

h_theta = 0 # head theta
h_r = 5 # head radius (in lights)
h_easing = 0.999 # head easing
t_theta = 0 # tail theta (offset from h_theta)
t_r = 5 # tail radius (in lights)
t_easing = 0.075 # tail easing

def init(theta, rho):
    global h_theta, t_theta, transition, time_start
    time_start = 0
    transition = 0
    t_theta = theta
    h_theta = theta
    # print "Init comet pattern {0} {1}\n".format(theta, rho),
    sys.stdout.flush()

def update(theta, rho, photo, primary_color, secondary_color, balls, strip):
    global h_theta,h_r,h_easing,t_theta,t_r,t_easing,transition, time_start

    if time_start == 0:
        time_start = timer()
        transition = 0
        print "Start solid timer {0}\n".format(time_start),
        sys.stdout.flush()
        h_theta = theta
        t_theta = theta

    led_count = strip.numPixels()

    # color of non-pixels
    bg_color = secondary_color
    # color of comet by ball
    ball_color = secondary_color
    if transition >= 1.0 and transition < 2.0:
        ball_color = colorBlend(secondary_color, primary_color, easeIn(transition-1.0))
    else:
        ball_color = primary_color
    tail_color = colorBlend(ball_color, bg_color, easeIn(0.5))

    time_diff = timer() - time_start
    elapsed = 1.0/60.0 # assume correct timing
    # print "Time diff %s, Elapsed %s\n" % (time_diff, elapsed),
    # sys.stdout.flush()

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
    if abs(diff) > 360: # reset tail if falling too far behind
        if h_theta > t_theta:
            t_theta = h_theta-360
        else:
            t_theta = h_theta+360

    # solid positions
    h_x = int( (h_theta * led_count) / 360 )
    t_x = int( (t_theta * led_count) / 360 )

    h_fixed = h_theta % 360
    t_fixed = t_theta % 360
    spread = diff

    # head positions
    h_spread = 360.0 / float(led_count) * h_r
    h_start = h_x - h_r
    h_end = h_x + h_r+1

    # tail positions
    t_spread = 360.0 / float(led_count) * t_r
    t_start = t_x - t_r
    t_end = t_x + t_r+1

    if transition < 1.0:
        for i in range(strip.numPixels()+1):
            strip.setPixelColor(i, colorBlend(strip.getPixelColor(i),bg_color,easeOut(transition)))
    else:
        fill(strip, bg_color) # default color

    # fade light by tail
    t_diff = max(abs(t_x - t_r - h_end), abs(t_x + t_r - h_start))
    if t_diff > h_r:
        for x in range(t_start, t_end):
            pos = x % led_count
            degrees = (float(x * 360) / led_count)

            t = abs((t_theta - degrees) / t_spread)
            percent = easeIn(t) # choose an ease function from above

            if transition >= 1.0:
                strip.setPixelColor(pos, colorBlend(tail_color,bg_color,percent))

    # fade light by ball
    for x in range(h_start, h_end):
        pos = x % led_count
        degrees = (float(x * 360) / led_count)

        t = abs((h_theta - degrees) / h_spread)
        percent = easeIn(t) # choose an ease function from above

        if transition >= 1.0:
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

                if transition >= 1.0:
                    strip.setPixelColor(pos, colorBlend(ball_color,tail_color,percent))

    # print "Theta %s, Head %s, Tail %s\n" % (theta, h_x, t_x),
    # sys.stdout.flush()

    # increment time
    time_end = timer()
    if transition < 2.0:
        transition += time_end - time_start
    time_start = time_end
