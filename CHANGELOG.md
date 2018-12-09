
# 2018-12-07, 1.10.9
  - if Servo table, go Home before doing install_updates, factory_reset, reboot, or restart
  

# 2018-12-06, 1.10.8
  - turn off sensored Rho for Servo tables
    - 2 ball tables, avoid t-boning the catcher instead of locking into it during parking, later sometimes getting two balls on one magnet.
  - change check_internet_interval to 1 minute instead of 30 minutes
    - fixes problems where sisbot was not on LAN and not putting up hotspot for up to 30 minutes.   If a sisbot has no clients connected to it (no browser, no phone) and the LAN connection is lost (dropped LAN, LAN changed passwords, etc), it was not discovering this for 30 minutes and therefore was not on LAN and was not putting up a hotspot.   Lowering this to 1 minute will cause the sisbot to discover the missing LAN and then put up its hotspot more quickly.

# 2018-10-17, 1.10.7
  - security fixes related to DNS rewrite attacks
    - do not put wifi ssid or password into any replies to connected clients
    - check the HTTP host headers and whitelist to allow only hosts that are on our local LAN to connect to the sisbot.  Refuse all other connections to sisbot.
  - 2 ball demo playlist, change to which tracks are included

# 2018-09-12, 1.10.1
  - if sisbot fails to find the internet, allow fallback node to accept connection to LAN that doesn't have internet access

# 2018-09-10, 1.8.0
  - don't show any 2 ball tracks if its not a 2 ball table

# 2018-09-10, 1.7.1
  - attach and detach tracks, 2 ball demo playlist only show if its a 2 ball table.


# 2018-08-23, 1.5.9
  - updates to the dimmer algorithm