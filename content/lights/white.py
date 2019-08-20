#!/usr/bin/env python3
# Fade
# Author: Matthew Klundt (matt@withease.io)
#
# Fade between primary/secondary color based on rho of Sisyphus ball

from neopixel import *

def brightness_adjust(color, photo):
    # brightness = int(photo*255.0/1024.0)
    brightness = photo/1024.0
    w1 = (color >> 24) & 0xFF;
    r1 = (color >> 16) & 0xFF;
    g1 = (color >> 8) & 0xFF;
    b1 = color & 0xFF;
    return Color(int(r1*brightness),int(g1*brightness),int(b1*brightness),int(w1*brightness))

def fill(strip, color):
    for i in range(strip.numPixels()+1):
        strip.setPixelColor(i, color)

def update(rho, theta, photo, primary_color, secondary_color, led_count, strip):
    col = brightness_adjust(primary_color, photo)
    fill(strip, col) # fill with white based on photo
    strip.show()
