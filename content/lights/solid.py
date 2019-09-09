#!/usr/bin/env python3
# Solid
# Author: Matthew Klundt (matt@withease.io)
#
# Show Primary Color

from neopixel import *

def fill(strip, color):
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)

def update(rho, theta, photo, primary_color, secondary_color, strip):
    fill(strip, primary_color) # fill with color
    strip.show()
