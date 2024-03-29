# 2020-08-05 1.10.71-73
  - System stats endpoint
  - State added to LEDs
  - Auto-generates "All Tracks Playlist"
  - Hotspot password/passcode merged
  - Calculate Track time remaining
  - Pause between tracks timer
  - Streaming coordinates
  - Fix Ansible reconnect
  - Fix LED pattern save bug
# 2020-03-11 1.10.67-70 504acb2722c107f9898ad105bd6dd671b5e8958f
  - Clear passcode on GPIO hold
  - Prevent crash if trying to generate thumbnail and thr file is (somehow) missing
  - Fix Artist models that were saved as Playlists (preventing edit from working)
  - Track "reversible" value switched to "is_reversible" (prevent WC changing it on us)
  - Erase default_vel is reset to default_status if different (such as when WC was unaware)
  - Network status values retained on reboot, until validation would change them (prevent Wifi unavailable screen on reboot)
  - Waits to set up Sleep/Wake/Clear_log timers until synced with NTP or app
  - On reboot, playlist continues with order from previous save. Maintains rho start of active track (i.e.: moves out to start rho of 1)
  - Clear IP on connect to wifi (so app doesn't retry connecting to hotspot IP)
  - Homing with clear_tracks value forces homing to 0 rho
# 2020-02-26 1.10.63-66 584044b7519c5f4824f56afb18e9b12e16daf69e
  - Fix update to Node 8.x (rc_fix.local step)
  - Exists() returns limited data
  - Incoming Post requests correctly filter out password values from logs in arrays of models
  - Log Connect() data, Siscloud/app version 1.10.01 will send data about device connecting
  - Socket_update sent data limited to keys that may change via given endpoint
  - Hold GPIO button for 3 seconds during play resets the table to hotspot, red light flashes three times when triggered
  - Start_hotspot always clears wpa_supplicant file
# 2020-01-23 1.10.60-62
  - Find Missing Thumbnails on startup
  - Improved speed on RGBW brightness change
  - LED offset of 0 is correctly changed/displayed
  - Always play on wake added
  - Network scan reduces results to just the SSIDs found (hopefully decreasing scan failures)
  - If SSID is typed, skip confirmation of network name appearing when attempting reconnect
  - Erase, Attach, Detach tracks marked as not deletable
  - Track reversible values set in default_status
  - Log status on daily clean_log_files
  - Adjustment of network recheck timing
# 2020-01-02 1.10.57-59
  - Fixed up regenerate_thumbnails()
  - Table is aware of number of thumbnails in generation queue
  - Fixed crash when track deleted before all thumbnails generated
  - Fix regenerate of non-shuffle playlist ordering
  - DR homing can home to rho 1
    - If changing track in same playlist, rho order is maintained
    - If non-shuffled playlist, rho order of non-shuffled maintained
    - If shuffled playlist, starts at closest rho
    - If single track, starts at closest rho (unless unable)
  - Re-enable Servo faults
  - Fix slanted apostrophe in SSID of wifi network list
# 2019-12-09 1.10.56
  - Increase points allowed in preview image generation (10000 -> 15000)
  - Fix playlist_add errors
  - Skip copy/date log files if empty
# 2019-11-01 1.10.54
  - Socket Ping Interval increased to help app not disconnect as often
  - Don't start track if paused between tracks on wake
  - Log files: Name unnamed tracks sent to plotter (i.e.: DEAD_RECKON)
  - Servo table should only care about theta sensor when DR homing is finished
  - Delay sleep until homing is finished (if homing during sleep command)
  - MAC address added to status
  - Runtime tracks have been named for logging
  - is_sleep_enabled fix for frontend
  - no save if network status has not changed (reduces extra log entries)
  - Software Update status
  - Download log file fix for files without dates
  - Servo fault state uses fault_status instead of reason_unavailable, won't block UI
  - Respect autoplay value of CSON
  - Additional validate_network debug logs
  - Firmware update will skip NPM install if no changes to package.json
  - Playlist initialization bugfix

# 2019-10-24 1.10.49
  - Download track images from Webcenter, create on table if unable
  - RGBW lights will change brightness when the table is paused (sleep or brightness slider)

# 2019-09-19 1.10.43
  - Name in CSON files
  - CSON RGBW Offset
  - Homing offset after successful sensored home
  - Clean Log files at midnight each day
  - Auto-install python requirements
  - Light Color bugfix
  - Paint modification
  - Added Python shared functions

# 2019-09-04 1.10.42
  - version bump, no changes

# 2019-08-26 1.10.41
  - Light patterns
  - Pattern brightness matches slider
  - Light offset added to Advanced Settings - Lights
  - Autodim is available on a per CSON basis (some tables may not support autodim)  
  - User can override CSON defaults
  - Multiple saves now queue up, preventing "Another save in process, try again" error messages
  - Light trail on Pi boot, color pattern on Node start
  - Fading blue/red on software update
  - Demo pattern
  - Install Python button for Advanced Table Settings

# 2019-09-04 1.10.32
  - version bump, no changes

# 2019-08-07 1.10.31
  - Jimmy homing
  - Allow empty password on wifi
  - save cson name & ball_count to model
  - home on rho 0
  - autoplay last playlist on reboot, or default playlist if none
  - fixed sensored home on first homing (non-servos)
  - fix DR drift from deceleration
  - lock out home button when homing
  - Motors de-power after 5 seconds of paused

# 2019-05-29 1.10.30
  - move sisbots over to webcenter

# 2019-05-29 1.10.28
  - wifi password fix for !$ and "
  - iw scan instead of iwlist
  - fix error on downloading today's proxy log file
  - wifi adapter scan on boot
  - api_endpoint changed to config setting
  - separate is_network_connected from is_internet_connected values, only goes to hotspot when !is_network_connected
  - fix compile error for USB
  - many fixes for errors on software update

# 2019-05-29 1.10.24
  - fix BLE ip_address change

# 2019-04-17 1.10.23
  - update Node to v 8.x.x on update, node_update.sh fix.
  - Versions .17, .18, .19 work in progress on Node to v 8 update
  - added is_servo to sisbot model for UI to know
  - status.json save() saves to tmp file, then moves after confirming data
  - ntp fix, sleep time sets self correctly after long power off
  - bugfix socket on startup/reconnect

# 2019-04-17 1.10.16
  - accel is no longer scaled along with velocity when the speed slider changes (acceleration should stay fixed)

# 2019-04-09 1.10.15
  - thumbnail_preview_generate error returned when no coordinates given
  - testing keys with Matt 2

# 2019-02-07 1.10.14
  - If sisbot is playing, and then pause and play are hit very quickly in sucession.  Do not act on the play if it has been less than 3 seconds since the pause was sent.  This value can be configured in the cson files with the variable pause_play_lockout_msec.  A value of 4000 would be 4 seconds.
  - Don't over write speed and brightness on restart.

# 2019-01-15 1.10.13
  - new hardware change on SBB's.  No longer need to sleep servo's when sisbot wakes up.  The sleep on wake up code from 1.10.12 was removed.
  - finishing up code started in 1.10.9 for servo's to send ball to home before doing install_updates, factory_reset, table_rename, reboot, or restart.  These operations reset the PI but don't cycle power on the SBB so the SBB autohome does not kick in and the sisbot can end up not knowing where the ball is after soft reboot which will result in eventual RHO fault for servo tables.  Going home before soft reboot will fix this issue.

# 2018-12-13 1.10.12
  - sleep servo when sisbot first wakes up.  The servo can take a long time to do the new hardware based home.  Sisbot was jumping in too early and starting to play a track, causing the bot to lose track of where it really was.
  - servo don't check for faults right away.  It takes some time before the setting of the enable pins to the new V2 servos take effect.  Before they take effect the SBB will report back servo faults, but it's not true as you can see on the motor lights there is no fault.  
  So after boot wait before starting to check

# 2018-12-11 1.10.11
  - incorporate Bruces new code to set the enable pins on V2 servos

# 2018-12-07, 1.10.10
  - this number was skipped

# 2018-12-07, 1.10.9
  - if Servo table, go Home before doing install_updates, factory_reset, reboot, or restart
  - This change was not ready and had to be rolled back out of the code to help meet year end shipping goals.

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
