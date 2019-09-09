#!/usr/bin/env python3
# White
# Author: Matthew Klundt (matt@withease.io)
#
# White with a color temperature

from neopixel import *

def fill(strip, color):
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)

def update(rho, theta, photo, primary_color, secondary_color, strip):
    fill(strip, primary_color) # fill with white
    strip.show()
