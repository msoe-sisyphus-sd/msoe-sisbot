#!/usr/bin/env python3
# White
# Author: Matthew Klundt (matt@withease.io)
#
# Fade between primary/secondary color based on rho of Sisyphus ball

from neopixel import *

def fill(strip, color):
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)

def update(rho, theta, photo, primary_color, secondary_color, led_count, strip):
    fill(strip, primary_color) # fill with white
    strip.show()
