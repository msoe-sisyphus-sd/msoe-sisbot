#!/usr/bin/env python3
# Software Update
# Author: Matthew Klundt (matt@withease.io)
#
# Breathing colors for software update

from neopixel import *
from math import sin

breathe_fade = 0
blue = Color(0,0,255,0)
white = Color(0,0,0,255)

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
    red = int((r1+(r2-r1)*blend))
    green = int((g1+(g2-g1)*blend))
    blue = int((b1+(b2-b1)*blend))
    white = int((w1+(w2-w1)*blend))
    return Color(red,green,blue,white)

def update(theta, rho, photo, primary_color, secondary_color, strip):
    global breathe_fade, blue, white

    percent = 0.5 + sin(breathe_fade) * 0.5
    fill(strip, colorBlend(white,blue,percent)) # fill with color based on rho only
    strip.show()

    breathe_fade += 0.005
