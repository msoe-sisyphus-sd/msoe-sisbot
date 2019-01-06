
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
