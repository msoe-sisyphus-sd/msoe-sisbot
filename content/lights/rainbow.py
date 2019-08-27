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

def update(rho, theta, photo, primary_color, secondary_color, led_count, strip):
    # offset of rainbow
    wheel_deg = int((-theta%360) / 360 * 255)
    # print "theta %s = %s \n" % (theta, wheel_deg),

    for i in range(0,led_count):
        pixel_offset = float(i)/led_count*255.0
        offset = (int(pixel_offset)+wheel_deg) & 255;
        # print "%d wheel_deg %s degrees + pixel_offset %s = %s \n" % (i, wheel_deg, pixel_offset, offset),
        strip.setPixelColor(i, brightness_adjust(wheel(offset), photo))

    strip.show()
