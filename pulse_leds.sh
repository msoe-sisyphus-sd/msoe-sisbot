#!/usr/bin/env bash

loops=1
if [ -n "$1" ]; then
  loops="$1"
fi

while [  $loops -ne 0 ];
do
  # fade up
  for ((i=1;i<1024;i+=52));
  do
    echo -e "SE,1,$i\r" > /dev/ttyACM0
    sleep 0.05
  done

  for ((i=1023;i>=0;i-=52));
  do
    echo -e "SE,1,$i\r" > /dev/ttyACM0
    sleep 0.05
  done

  if [ $loops -gt 0 ]; then
    loops=$((loops-1))
  fi
done

# off
echo -e "SE,0\r" > /dev/ttyACM0
