var util = require('util');
var path = require('path');
var fs = require('fs'); // for file reading
var _ = require('underscore');
var moment = require('moment');
var config = require('./config');

//globals:
var twoBallEnabled = false;
var rgbwEnabled = false;
var Vball = 2,
  Accel = 2,
  MTV = 0.5,
  Vmin = 0.1,
  Voverride = 1;
var balls = 1; //sis vs tant mode

//machine constants:
var plotRadius, segRate = 20;
var thSPRev, rSPRev, rSPInch;
var nestedAxisSign = 1,
  thDirSign = 1,
  rDirSign = -1;

var rthAsp = rSPRev / thSPRev; //r-th aspect ratio
var rCrit = Vball / MTV;
var thSPRad //= thSPRev / (2* Math.PI);
var accelSegs = Vball * segRate / (2 * Accel); //logEvent(1, 'accelSegs: '+accelSegs );
var VminSegs = Vmin * segRate / (2 * Accel); // logEvent(1, 'VminSegs:'+VminSegs);
var ASfin = accelSegs;
var ASindex = VminSegs; //accelSegs index
var baseMS = 1000 / segRate; //msec per segment, no V adjustment

var useJimmyHoming = false; // Moves ball to halfway across sensor when doing sensored home
var useHomeSensors; // True if the bot has sensors. Otherwise the current position is considered home.
var homingThPin; // SBB board pin for homing theta sensor
var homingRPin; // SBB board pin for homing rho sensor
var homingThHitState; // The value the sensor reports when triggered. 0 or 1.
var homingRHitState; // The value the sensor reports when triggered. 0 or 1.

var useLED = true;

var rSensorSpan = 0; // span of homing sensor, use this to find true center
var rSensorCenter = 0; // half of rSensorSpan, use to move to center
var useFaultSensors = 0; // True if the bot has sensors. Otherwise the current position is considered home.
//var faultThPin = "D,1"; // SBB board pin for homing theta sensor
//var faultRPin = "D,0"; // SBB board pin for homing rho sensor
var faultActiveState = 1;

var STATUS = 'waiting'; //vs. playing, homing
var options = { //user commands available
  pause: false,
  play: true,
  home: true,
  jog: true,
  speed: true,
  content: true
};

var verts = []; //array of path vertices
var vert = {
  th: 0,
  r: 0
}; //vertex object
var miMax, thAccum = 0,
  rAccum = 0;
var pauseRequest = false;

var sp // serial port
var sp_lcp // light controller program socket

var paused = true;
//pars stored for pause/resume:
var Rmi, RmiMax, Rsi, RsiMax, RthStepsSeg, RrStepsSeg;
var RthLOsteps, RrLOsteps, ReLOth, ReLOr, RfracSeg;

var RDIST = 0,
  THRAD = 0,
  MOVEDIST = 0,
  RSEG = 0;
var RF2MIN = 1;
var JOGTHSTEPS = 100,
  JOGRSTEPS = 100;
var HOMETHSTEPS = 30 * thDirSign,
  HOMERSTEPS = 30,
  HOMERSPANSTEPS = 10;

var COUNTER = 0;

var THETA_HOME_COUNTER = 0,
  THETA_HOMED, WAITING_THETA_HOMED;
var THETA_HOME_MAX; //=  Math.round(thSPRev * 1.03 / HOMETHSTEPS);//3% extra

var RHO_HOME_COUNTER = 0,
  RHO_HOMED, WAITING_RHO_HOMED;
var RHO_HOME_MAX; //=  Math.round(rSPInch * (plotRadius + 0.25) / HOMERSTEPS);// 1/4" extra
var RETESTCOUNTER = 0,
  RETESTNUM = 5;
var THETA_FAULTED, R_FAULTED;

var plistRepeat = true;
var PLHOMED = false;
var ABLETOPLAY = true;
var moment = require("moment");

//globals for autodimming:
var autodim = "true";
var rawPhoto = 1; //raw photosensor 10-bit analog value
//var rawPhotoLast = 1;
var photoArraySize = 16; //higher-->slower change
var photoArray = [];
photoArray.length = photoArraySize;
photoArray.fill(0);
//var BR = 1; // user brightness scalar 0-1
var BRamp = 2; //BR multiplier
var photoSum = 0;
var photoMin = 5; //minimum non-off LED brightness
photoArray.fill(photoMin);
var photoAvgOld = photoMin;
var bigChangeCounter = 0;
var bigChangeIsReal = 4; //higher vals -> slower response, but more stable
var photoMsec = 250; // -sample potosensor every.  higher-->slower change
var sliderBrightness;
var lastPhotoOut = photoMin;
var photoTimeout; // timeout value, so we don't call extra times
var ctr = 0;
var certain = 4;

var maTheta; //Theta current
var maR; //R current
var Vm; //motor voltage

var IS_SERVO;
var servo_wait_before_faulting = false;

function checkPhoto() { //autodimming functionality:
  var photo, photoAvg = 0,
    photoOut = 0,
    delta, trusted = true;
  if (plotRadius > 10) BRamp = 4; //temp fix for less light under 36 than 22

  sp.write("I\r"); //SBB command to check digital inputs

  if (useFaultSensors) sp.write("A2\r"); //SBB command to check analog inputs
  else sp.write("A\r");


  if (autodim == "true") { //need to check autodim toggle fn'ing
    //console.log("photoAvgOld: " + photoAvgOld);
    //filter spurious readings:
    if (Math.abs(rawPhoto - photoAvgOld) / photoAvgOld > 0.5) {
      if (bigChangeCounter < bigChangeIsReal) {
        bigChangeCounter = bigChangeCounter + 1;
        //console.log("bigChangeCtr = " + bigChangeCounter );
        photoOut = photoAvgOld; // don't trust use prior avg
        photoAvg = photoAvgOld;
        trusted = false;
      }

    }
    if (trusted) { //trusted sensor reading
      bigChangeCounter = 0;
      photo = rawPhoto;

      if (photo > 1023) {
        photo = 1023;
      }
      if (photo < photoMin) {
        photo = photoMin;
      } //photomin?
      //console.log( "raw photo = " + photo)


      //logEvent(1, "photoSum = " + photoSum)

      photoArray.shift(); //delete first val in array
      photoArray.push(photo); //add new val to end
      photoSum = photoArray.reduce(add, 0);
      photoAvg = photoSum / photoArraySize;

      photoOut = photoAvg;
      //console.log("photoAvg* = " + photoAvg);
      //logEvent(1, "photoAvg = " + photoAvg);
    }

    photoAvgOld = photoAvg;

    if (sliderBrightness > 0.5) {
      photoOut *= BRamp * (Math.pow(5, sliderBrightness * 2) - 4);
    } else {
      photoOut *= sliderBrightness * BRamp * 2;
    };

    photoOut = Math.round(photoOut);
    if ((photoOut > 0) && (photoOut < photoMin)) {
      photoOut = photoMin;
    }
    if (photoOut > 1023) {
      photoOut = 1023
    };

    //logEvent(1, "photoOut = " + photoOut);

    delta = Math.abs(photoOut - lastPhotoOut);
    if (lastPhotoOut > 0) {
      delta /= lastPhotoOut
    }

    //logEvent(1, "delta = " + delta);

    if (delta >= .5) {

      if (photoOut != 0) {
        if (useLED) sp.write("SE,1," + photoOut + "\r");
        // logEvent(0, "SE,1," + photoOut);
      } else {
        sp.write("SE,0\r");
        //console.log("SE,0\r");
        //logEvent(1, "SE,0");
      }

      lastPhotoOut = photoOut;
    }
  }

  // remove extra timeout calls
  clearTimeout(photoTimeout);
  if (STATUS != 'homing') { //stop photosensing if homing
    photoTimeout = setTimeout(checkPhoto, photoMsec);
  }
}

function add(a, b) {
  return a + b;
}

function setStatus(newStatus) {

  // Callback when the state changes, only if the state changes.
  if (STATUS != newStatus) {
    var oldStatus = STATUS;
    setTimeout(function() {
      onStateChanged(newStatus, oldStatus);
    }, 0);
  }

  // Set the new status.
  STATUS = newStatus;

  // Update the options tables with what's allowed in the new status.
  switch (STATUS) {
    case 'waiting':
      options = {
        pause: false,
        play: true,
        home: true,
        jog: true,
        speed: true,
        content: true
      };
      return;

    case 'playing':
      options = {
        pause: true,
        play: false,
        home: false,
        jog: false,
        speed: true,
        content: false
      };
      return;

    case 'homing':
      options = {
        pause: true,
        play: false,
        home: false,
        jog: false,
        speed: false,
        content: false
      };
      return;
  }
}

//////      NEXTMOVE     ///////////////////////////////////
function nextMove(mi) {
  var moveThRad, moveRdist, moveThDist, moveDist;
  var segsReal, segs, fracSeg = 1.0;
  var thStepsOld, thStepsNew, thStepsMove, thStepsSeg, thLOsteps;
  var rStepsOld, rStepsNew, rStepsMove, rStepsComp, rStepsSeg, rLOsteps;
  var thOld, rOld, thNew, rNew;
  var headingNow;
  // logEvent(1, util.inspect(process.memoryUsage()));

  // if `mi` isn't set, we're starting a new track, so start at zero.
  mi = mi || 0;

  // log progress, without scrolling thousands of lines.
  /*
	process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write('progress: ' + mi + ' / ' + miMax);
	*/

  if (mi >= miMax) {
    logEvent(1, 'all moves done');
    logEvent(1, 'thAccum = ' + thAccum);
    logEvent(1, 'rAccum = ' + rAccum);
    verts = []; //clear verts array

    onFinishTrack();
    setStatus('waiting');
    return;
  }

  thOld = verts[mi].th;
  rOld = verts[mi].r;

  if (mi == 0) {
    logEvent(1, 'COUNTER:', ++COUNTER);
    correctGap();
  }

  thNew = verts[mi + 1].th;
  rNew = verts[mi + 1].r;

  moveThRad = thNew - thOld;
  THRAD = moveThRad;
  moveRdist = (rNew - rOld) * plotRadius;
  RDIST = moveRdist;

  moveThDist = moveThRad * rCrit;
  moveDist = Math.sqrt((moveThDist * moveThDist) + (moveRdist * moveRdist));
  MOVEDIST = moveDist;

  headingNow = Math.atan2(moveRdist, moveThDist);

  if (mi < miMax - 1) lookAhead(mi, headingNow);
  else ASfin = VminSegs; //next move is last

  segsReal = moveDist * segRate / Vball;
  segs = Math.floor(segsReal);

  //deal with tiny moves here:
  if (segs == 0) {
    segs = 1;
    fracSeg = segsReal;
    //logEvent(1, 'TINY MOVE, frac= '+segsReal)
  } else fracSeg = 1;

  thStepsNew = Math.floor(thNew * thSPRad) * thDirSign;
  thStepsOld = Math.floor(thOld * thSPRad) * thDirSign;
  thStepsMove = thStepsNew - thStepsOld;

  rStepsNew = Math.floor(rNew * rSPInch * plotRadius) * rDirSign;
  rStepsOld = Math.floor(rOld * rSPInch * plotRadius) * rDirSign;
  rStepsMove = rStepsNew - rStepsOld;


  //rStepsComp =  (Math.floor(thNew * thSPRad * rthAsp) -
  //  Math.floor(thOld  * thSPRad * rthAsp))  * nestedAxisSign;

  //rStepsComp =  Math.floor(thNew / (2 * Math.PI) * rSPRev ) -
  //      Math.floor(thOld / (2 * Math.PI) * rSPRev )  * nestedAxisSign;
  //  logEvent(1, rStepsComp + '*');

  rStepsComp = Math.floor(thStepsNew * rthAsp * nestedAxisSign) - Math.floor(thStepsOld * rthAsp * nestedAxisSign);

  //logEvent(1, rStepsComp + '');

  //rStepsComp = Math.floor(thStepsMove * rthAsp )* nestedAxisSign;
  //logEvent(1, rStepsComp + '*');


  rStepsMove += rStepsComp;

  thStepsSeg = Math.floor(thStepsMove / segs);
  thLOsteps = thStepsMove - thStepsSeg * segs; //th Left Over steps

  rStepsSeg = Math.floor(rStepsMove / segs);
  rLOsteps = rStepsMove - rStepsSeg * segs; //r Left Over steps

  //logEvent(1, 'move ' + mi + ' of ' + miMax);

  nextSeg(mi, miMax,0,segs, thStepsSeg, rStepsSeg, thLOsteps, rLOsteps, 0, 0, fracSeg);

}
//////      NEXTSEG     ///////////////////////////////////
function nextSeg(mi, miMax ,si, siMax, thStepsSeg, rStepsSeg, thLOsteps, rLOsteps, eLOth, eLOr, fracSeg) {
  var msec = baseMS;
  var cmd;
  var thLOsign = 0,
    rLOsign = 0;
  var thStepsOut, rStepsOut;
  var rSeg, rEffect, rFactor1, rFactor2;

  if (si == siMax) {
    //logEvent(1, 'move '+mi+' done, ' + counter + ' segs');
    mi++;
    nextMove(mi);
    return;
  }
  accelSegs = Vball * Voverride * segRate / (2 * Accel); //accel fix for speed slider effect
  //ACCEL/DECEL ---------------------------
  if (!pauseRequest) {
    //logEvent(1, ASindex);
    if ((ASindex > ASfin) && (ASindex - ASfin > siMax - si)) ASindex--; //decel;
    else {
      if (ASindex < accelSegs) ASindex++; //accel
      if (ASindex > accelSegs) ASindex = accelSegs; //updates Accel changes ?--;?
    }
  } else { // pause requested:
    logEvent(1, 'decelerating...');
    //logEvent(1, ASindex);
    if (ASindex <= VminSegs) {
      ASindex = VminSegs;
      logEvent(1, 'PAUSED, waiting...');
      paused = true;
      pauseRequest = false;
      setStatus('waiting');

      //record current segment pars:
      Rmi = mi;
      RmiMax = miMax;
      Rsi = si;
      RsiMax = siMax;
      RthStepsSeg = thStepsSeg;
      RrStepsSeg = rStepsSeg;
      RthLOsteps = thLOsteps;
      RrLOsteps = rLOsteps;
      ReLOth = eLOth;
      ReLOr = eLOr;
      RfracSeg = fracSeg;

      // sp.write('EM,0,0\r'); // turn off motors
      // kill motors after 5 seconds if still paused
      setTimeout(function() {
        if (paused) {
          logEvent(0, "Stop motors");
          sp.write('EM,0,0\r'); // turn off motors
        } else {
          logEvent(0, "Not paused anymore, disregard motor stop");
        }
      }, 5000);

      return; //break the nextSeg chain = being paused
    } else ASindex--; //decel on the way to being paused
  }
  //------------------------------------
  if (ASindex < VminSegs) ASindex = VminSegs;
  msec *= Math.sqrt(accelSegs / ASindex);
  msec /= Voverride;
  msec *= fracSeg;
  //logEvent(1, fracSeg);
  //------------------------------------

  rSeg = (rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign / rSPInch;
  RSEG = rSeg;
  //logEvent(1, 'rSeg: ' + Math.floor(rSeg*1000)/1000);
  if (balls == 1) rEffect = rSeg; //sis
  else rEffect = plotRadius / 2 + Math.abs(plotRadius / 2 - rSeg); //tant

  if (rEffect > rCrit) { //ball is outside rCrit:
    rFactor1 = Math.sqrt((RDIST * RDIST + THRAD * THRAD * rEffect * rEffect)) / MOVEDIST;
    //logEvent(1, 'rFactor1: ' + rFactor1);
    msec *= rFactor1;
  } else { //ball is inside rCrit-- this is shaky at best...
    if (rSeg > RF2MIN) {
      rFactor2 = Math.abs((RDIST / MOVEDIST) * (rCrit / rSeg));
    } else {
      rFactor2 = Math.abs((RDIST / MOVEDIST) * (rCrit / RF2MIN));
    }
    rFactor2 *= 0.7; //just empirical tweak downward
    //logEvent(1, 'rFactor2: ' + rFactor2);
    if (rFactor2 < 1) rFactor2 = 1;
    msec *= rFactor2;
  }

  //------------------------------------

  thStepsOut = thStepsSeg;
  rStepsOut = rStepsSeg;

  if (thLOsteps < 0) thLOsign = -1;
  else thLOsign = 1;
  if (rLOsteps < 0) rLOsign = -1;
  else rLOsign = 1;

  eLOth += Math.abs(thLOsteps);
  eLOr += Math.abs(rLOsteps);

  if (eLOth >= siMax) {
    thStepsOut += thLOsign;
    eLOth -= siMax;
  }

  if (eLOr >= siMax) {
    rStepsOut += rLOsign;
    eLOr -= siMax;
  }

  msec = Math.floor(msec);
  if (msec < 1) msec = 1;
  cmd = "SM," + msec + "," + thStepsOut + "," + rStepsOut + "\r";

  // Row
  var newR = ((rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign/ rSPInch)/plotRadius;
  // Theta
  var thetaDistHome, modRads, rawRads, shortestRads;
  rawRads = thAccum / thSPRad;
  modRads = rawRads % (2 * Math.PI);
  shortestRads = modRads*-1; //this is verified correct - but theta sign is wrong :(
  if (modRads > Math.PI) shortestRads = 2 * Math.PI - modRads; //shortestRads = modRads - 2 * Math.PI;
  if (modRads < -1 * Math.PI) shortestRads = -2 * Math.PI - modRads; //shortestRads = modRads + 2 * Math.PI;
  var newTh = shortestRads;

  sp.write(cmd, function(err, res) {
    sp.drain(function(err, result) {
      if (err) logEvent(2, err, result);
      else {
        // send to socket
        try {
          // Row
          var newR = ((rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign/ rSPInch)/plotRadius;
          // Theta
          var thetaDistHome, modRads, rawRads, shortestRads;
          rawRads = thAccum / thSPRad;
          modRads = rawRads % (2 * Math.PI);
          shortestRads = modRads*-1; //this is verified correct - but theta sign is wrong :(
          if (modRads > Math.PI) shortestRads = 2 * Math.PI - modRads; //shortestRads = modRads - 2 * Math.PI;
          if (modRads < -1 * Math.PI) shortestRads = -2 * Math.PI - modRads; //shortestRads = modRads + 2 * Math.PI;
          var newTh = shortestRads;
          
          var buf1 = Buffer.from('b', 0, 1);
          var buf2 =  Buffer.alloc(4);
          buf2.writeFloatBE(newR, 0);
          var buf3 =  Buffer.alloc(4);
          buf3.writeFloatBE(newTh, 0);
          var buf4 =  Buffer.alloc(4);
          buf4.writeFloatBE(lastPhotoOut, 0);
          var totalLength = buf1.length + buf2.length + buf3.length + buf4.length;

          // var d = new Date();
          // var n = d.getMilliseconds();
          // logEvent(1, "Millis", n);

          // logEvent(1, "Values: ", newR, newTh, lastPhotoOut, "Buffer Length:", totalLength);
          message = Buffer.concat([buf1, buf2, buf3, buf4], totalLength);

          sp_lcp.send(message, 0, totalLength, '/tmp/sisyphus_sockets');
          // logEvent(1,'LCP ' + inp);
        } catch (err) {
          // logEvent(2,'Error writing to LCP socket ' + err.message);
        }

        //logEvent(1, cmd);
        si++;
        thAccum += thStepsOut;
        rAccum += rStepsOut;

        nextSeg(mi, miMax, si, siMax, thStepsSeg, rStepsSeg, thLOsteps, rLOsteps, eLOth, eLOr, 1);
      }
    });
  });
}

//////      LOOK AHEAD     ///////////////////////////////////
function lookAhead(mi, heading) {
  var LAthDist = (verts[mi + 2].th - verts[mi + 1].th) * rCrit;
  var LArDist = (verts[mi + 2].r - verts[mi + 1].r) * plotRadius;

  //logEvent(1, 'current heading: '+ heading);

  var LAheading = Math.atan2(LArDist, LAthDist)
  //logEvent(1, 'LA heading: '+ LAheading)

  var dHeading = LAheading - heading;
  dHeading = Math.abs(dHeading);

  var inertiaFactor = Math.sin(dHeading / 2);
  //logEvent(1, 'inertiaFactor: '+ inertiaFactor);
  ASfin = accelSegs * (1 - inertiaFactor); //+1?
  //logEvent(1, 'ASfin: '+ ASfin);
}

function go() {
  paused = false;
  setStatus('playing');
  nextSeg(Rmi, RmiMax, Rsi, RsiMax, RthStepsSeg, RrStepsSeg, RthLOsteps, RrLOsteps, ReLOth, ReLOr, RfracSeg);
}

//////      GO THETA HOME    ///////////////////////////////////
function goThetaHome() {
  var thetaHomingStr, thetaHomeQueryStr = "PI," + homingThPin + "\r";
  //Theta home pin B7 sbb1, D2 sbb1.1, (C0 ebb)//R home pin C6

  WAITING_THETA_HOMED = true;

  if (pauseRequest) {
    pauseRequest = false;
    setStatus('waiting');
    logEvent(1, 'theta homing aborted');

    photoTimeout = setTimeout(checkPhoto, photoMsec); //restart photosensing for autodim

    return;
  }

  if (THETA_HOME_COUNTER == THETA_HOME_MAX) {
    logEvent(2, 'Failed to find Theta home!');
    //setStatus('waiting');
  	thAccum = 0;
  	WAITING_THETA_HOMED = false;
  	setStatus('home_th_failed');

  	photoTimeout = setTimeout(checkPhoto, photoMsec); //restart photosensing for autodim
    return;
  }

  sp.write(thetaHomeQueryStr);

  if (!THETA_HOMED) { //not home yet, move toward home:

    var rCompSteps = Math.round(HOMETHSTEPS * rthAsp * nestedAxisSign) * thDirSign;
    thetaHomingStr = "SM," + baseMS + "," + HOMETHSTEPS * thDirSign + "," + rCompSteps + "\r";

    THETA_HOME_COUNTER++;
    // if (config.debug) logEvent(1, THETA_HOME_COUNTER);

    sp.write(thetaHomingStr, function(err, res) {
      sp.drain(function(err, result) {
        if (err) {
          logEvent(2, err, result);
        } else {
          // if (config.debug) logEvent(1, thetaHomingStr);
          WAITING_THETA_HOMED = true;

          goThetaHome();
        }
      });
    });

  } else { //Theta home sensor activated, confirm it:

    if (RETESTCOUNTER < RETESTNUM) { //not fully confirmed yet:
      RETESTCOUNTER++;
      // if (config.debug) logEvent(1, "RETESTCOUNTER: " + RETESTCOUNTER);
      sp.write(thetaHomeQueryStr, function(err, res) {
        sp.drain(function(err, result) {
          if (err) {
            logEvent(2, err, result);
          } else {
            // if (config.debug) logEvent(1, thetaHomeQueryStr);
            WAITING_THETA_HOMED = true;
            //allow time for return of sensor state:
            setTimeout(goThetaHome, 15);


            //goThetaHome();
          }
        });
      });
    } else { //passed retesting so truly home:
      thAccum = 0;
      THETA_HOME_COUNTER = 0;
      // logEvent(1, 'THETA AT HOME!');
      RETESTCOUNTER = 0;
      WAITING_THETA_HOMED = false;
      //WAITING_RHO_HOMED = true;

      //logEvent(1, 'finding R home...');

      setTimeout(goRhoHome, 150);

    }

  }

}

//////      GO RHO HOME    ///////////////////////////////////
function goRhoHome() {
  var rhoHomingStr, rhoHomeQueryStr = "PI," + homingRPin + "\r";

  if (IS_SERVO) { //skip sensored homing RHO:
    rAccum = 0;
    photoTimeout = setTimeout(checkPhoto, photoMsec); //restart photosensing for autodim
    setStatus('waiting');
    return;
  }

  WAITING_RHO_HOMED = true;

  if (pauseRequest) {
    pauseRequest = false;
    setStatus('waiting');
    logEvent(1, 'rho homing aborted');
    photoTimeout = setTimeout(checkPhoto, photoMsec); //restart photosensing for autodim
    return;
  }

  if (RHO_HOME_COUNTER == RHO_HOME_MAX) {
    logEvent(2, 'Failed to find Rho home!');
    //setStatus('waiting');
    rAccum = 0;
    WAITING_RHO_HOMED = false; // stop trying to home
    setStatus('home_rho_failed');
    return;
  }

  sp.write(rhoHomeQueryStr); // ask if we are home

  if (!RHO_HOMED) { // not home yet, move toward home:

    rhoHomingStr = "SM," + baseMS + "," + 0 + "," + -HOMERSTEPS * rDirSign + "\r"; // move towards home

    RHO_HOME_COUNTER++;
    RETESTCOUNTER = 0;
    // logEvent(1, RHO_HOME_COUNTER);

    sp.write(rhoHomingStr, function(err, res) {
      sp.drain(function(err, result) {
        if (err) {
          logEvent(2, err, result);
        } else {
          // logEvent(1, rhoHomingStr);
          // WAITING_RHO_HOMED = true;

          goRhoHome();
        }
      });
    });
  } else { //Rho home sensor activated, confirm it:
    if (RETESTCOUNTER < RETESTNUM) { //not fully confirmed yet:
      RETESTCOUNTER++;
      logEvent(1, "RETESTCOUNTER: " + RETESTCOUNTER);
      sp.write(rhoHomeQueryStr, function(err, res) {
        sp.drain(function(err, result) {
          if (err) {
            logEvent(2, err, result);
          } else {
            logEvent(1, "Rho Home", rhoHomeQueryStr);

            // allow time for return of sensor state:
            setTimeout(goRhoHome, 15);
          }
        });
      });
    } else { // sensor edge found
      if (useJimmyHoming) {
        if (rSensorCenter > 0) {
          // move in rSensorCenter
          var rhoFix = "SM,250,0," + -rSensorCenter * rDirSign + "\r";

          // move in, then done
          sp.write(rhoFix, function(err, res) {
            sp.drain(function(err, result) {
              if (err) {
                logEvent(2, err, result);
              } else {
                logEvent(0, "Centered Jimmy Homing", rSensorCenter);
                homeSuccess();
              }
            });
          });
        } else {
          // find other sensor edge
          logEvent(1, "Rho Home found edge");
          goRhoHomeSpan();
        }
      } else homeSuccess(); // No Jimmy Homing, finished
    }
  }

}

function goRhoHomeSpan() {
  logEvent(0, "Go Rho Home Span", rSensorSpan, rSensorCenter, RETESTCOUNTER);
  var rhoHomeQueryStr = "PI," + homingRPin + "\r";

  // check sensor
  sp.write(rhoHomeQueryStr); // ask if we are home

  if (RHO_HOMED) { // still within sensor, move more
    logEvent(1, "Clear Retest Counter");
    RETESTCOUNTER = 0; // clear counter

    // move toward other side of sensor
    var rhoHomingStr = "SM,100,0," + -HOMERSPANSTEPS * rDirSign + "\r";

    sp.write(rhoHomingStr, function(err, res) {
      sp.drain(function(err, result) {
        if (err) {
          logEvent(2, err, result);
        } else {
          rSensorSpan += HOMERSPANSTEPS;

          goRhoHomeSpan();
        }
      });
    });
  } else {
    // recheck reading
    if (RETESTCOUNTER < RETESTNUM) { //not fully confirmed yet:
      RETESTCOUNTER++;
      logEvent(0, "RETESTCOUNTER: " + RETESTCOUNTER);

      sp.write(rhoHomeQueryStr, function(err, res) {
        sp.drain(function(err, result) {
          if (err) {
            logEvent(2, err, result);
          } else {
            logEvent(0, "Rho Span", rhoHomeQueryStr);

            // allow time for return of sensor state:
            setTimeout(goRhoHomeSpan, 15);
          }
        });
      });
    } else {
      if (!RHO_HOMED) {
        // move back half of rSensorSpan
        rSensorCenter = rSensorSpan/2;

        logEvent(0, "Jimmy Home sensor passed", rSensorSpan, rSensorCenter);
        var rhoFix = "SM,250,0," + rSensorCenter * rDirSign + "\r";

        sp.write(rhoFix, function(err, res) {
          sp.drain(function(err, result) {
            if (err) {
              logEvent(2, err, result);
            } else {
              homeSuccess();
            }
          });
        });
      } else {
        setTimeout(goRhoHomeSpan, 15);
      }
    }
  }
}

function homeSuccess() {
  // passed retesting so truly home:
  RETESTCOUNTER = 0;

  thAccum = 0;
  THETA_HOME_COUNTER = 0;
  WAITING_THETA_HOMED = false;

  rAccum = 0;
  RHO_HOME_COUNTER = 0;
  WAITING_RHO_HOMED = false;

  logEvent(0, 'Plotter: Homed');

  if (PLHOMED) { //homed from playlist
    setStatus('playing');
    if (PLAYTYPE == 'shuffle') { //relevant only for homes in shuffleplay
      plistLines.splice(PLINDEX, 1); //pluck out plLines[PLINDEX]
      //logEvent(1, plistLines);
      REMAINING--;
    }
    nextPlaylistLine(PLINDEX, plLinesMax);
  } else { //homed manually
    setStatus('waiting');
  }

  photoTimeout = setTimeout(checkPhoto, photoMsec); //restart photosensing for autodim

  return;
}


//////      JOG     ///////////////////////////////////
function jog(axis, direction) {
  var jogThsteps = 0,
    jogRsteps = 0;

  if (axis == "theta") {
    if (direction == 'pos') jogThsteps = JOGTHSTEPS * thDirSign;
    else jogThsteps = JOGTHSTEPS * -thDirSign;

    jogRsteps = Math.round(jogThsteps * rthAsp * nestedAxisSign);
  }

  if (axis == "rho") {
    if (direction == 'pos') jogRsteps = JOGRSTEPS * rDirSign;
    else jogRsteps = JOGRSTEPS * -rDirSign;
  }

  sp.write("SM," + baseMS + "," + jogThsteps + "," + jogRsteps + "\r", function(err, res) {
    sp.drain(function(err, result) {
      if (err) {
        logEvent(2, err, result);
      } else {
        thAccum += jogThsteps;
        rAccum += jogRsteps;

        // send to socket
        try {
          var buf1 = Buffer.from('b', 0, 1);
          var buf2 =  Buffer.alloc(4);
          buf2.writeFloatBE(rAccum, 0);
          var buf3 =  Buffer.alloc(4);
          buf3.writeFloatBE(thAccum, 0);
          var buf4 =  Buffer.alloc(4);
          buf4.writeFloatBE(lastPhotoOut, 0);
          var totalLength = buf1.length + buf2.length + buf3.length + buf4.length;

          // var d = new Date();
          // var n = d.getMilliseconds();
          // logEvent(1, "Millis", n);

          // logEvent(1, "Values: ", newR, newTh, lastPhotoOut, "Buffer Length:", totalLength);
          message = Buffer.concat([buf1, buf2, buf3, buf4], totalLength);

          sp_lcp.send(message, 0, totalLength, '/tmp/sisyphus_sockets');
          // logEvent(1,'LCP ' + inp);
        } catch (err) {
          // logEvent(2,'Error writing to LCP socket ' + err.message);
        }
      }
    });
  });
}

function reportRgap() {
  var Ractual;
  var Rinfile;

  Ractual = (rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign / rSPInch;
  Rinfile = verts[0].r * plotRadius;
  //logEvent(1, 'Ractual: ' + Ractual);
  //logEvent(1, 'Rinfile: ' + Rinfile);
  // logEvent(1, 'Rgap: ' + (Ractual - Rinfile));
  logEvent(1, 'Rgap: ' + (Ractual - Rinfile));
  logEvent(1, 'thAccum: ' + thAccum + '  rAccum: ' + rAccum);
}

function correctGap() {
  var Ractual;
  var Rinfile;
  var steps = 0;

  Ractual = (rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign / rSPInch;
  Rinfile = verts[0].r * plotRadius;
  steps = Math.round((Ractual - Rinfile) * rSPInch) * -rDirSign;

  sp.write("SM,1,0," + steps + "\r", function(err, res) {
    sp.drain(function(err, result) {
      if (err) {
        logEvent(2, err, result);
      } else {
        logEvent(1, 'gap steps ' + steps);
        rAccum += steps;
      }
    });
  });
}

var logEvent = function() {
  // save to the log file for plotter
  if (config.folders.logs) {
    var filename = config.folders.logs + '/' + moment().format('YYYYMMDD') + '_plotter.log';

    var line = moment().format('YYYYMMDD HH:mm:ss Z');
    _.each(arguments, function(obj, index) {
      if (_.isObject(obj)) line += "\t" + JSON.stringify(obj);
      else line += "\t" + obj;
    });

    // redline errors
    if (process.env.NODE_ENV != undefined) {
      if (process.env.NODE_ENV.indexOf('_dev') >= 0) {
        if (arguments[0] == 0 || arguments[0] == '0') line = '\x1b[32m' + line + '\x1b[0m'; // Green
        if (arguments[0] == 2 || arguments[0] == '2') line = '\x1b[31m' + line + '\x1b[0m'; // Red
        console.log(line);
      }
    }
    fs.appendFile(filename, line + '\n', function(err, resp) {
      if (err) console.log("Plotter Log err", err);
    });
  } else console.log(arguments);
}

{ ////////Serial Port events--//////////////////////////////////////////

}

function parseReceivedSerialData(data) {
  var parts;
  //remove any line breaks in string:
  data = String(data).replace(/(\r\n|\n|\r)/gm, "");

  // if (config.debug) logEvent(1, "in " + data);
  parts = String(data).split(',');

  if (parts[0] == '!') {
    logEvent(2, "EBB error: " + data);
  } else {
    if (parts[0] == 'A') { //analog data Tma, Rma, photo, Vm - (legacy)
      //logEvent(1, parts)

      if (data.length == 33) { //analog report came back complete
        if (parts[1]) {
          maTheta = Number(parts[1].slice(3, 7)) * 707 * 3.3 / 1023;
          //logEvent(1, 'Theta current = ' + Math.round(maTheta) + 'mA') ;
        }

        if (parts[2]) {
          maR = Number(parts[2].slice(3, 7)) * 707 * 3.3 / 1023;
          //logEvent(1, 'R current = ' + Math.round(maR) + 'mA') ;
        }

        if (parts[3]) {
          rawPhoto = Number(parts[3].slice(3, 7));
          //logEvent(1, rawPhoto);
        }

        if (parts[4]) {
          Vm = Number(parts[4].slice(3, 7)) * 25 * 3.3 / 1023 / 2.717;
          //logEvent(1, "Vm= " + Math.round(Vm * 10)/10);
        }
      }
    }

    //	if (parts[0] == 'A1'){} for future use when serial parser improved...
    //for SBB 2.2.18+, avg'd Tma, Rma, photo, Vm and sampleCount

    if (parts[0] == 'A2') { // for SBB 2.2.18+ only avg'd photo and sampleCount
      if (data.length == 20) { // analog report came back complete
        if (parts[1]) {
          photoAccum = Number(parts[1].slice(3, 11));
          //console.log("photoAccum= " + photoAccum);
        }
        if (parts[2]) {
          sampleCount = Number(parts[2].slice(3, 8)) //count is always , 5 digits
          //console.log( "sampleCount= "+ sampleCount);
          //if (sampleCount>9999) resend "A" command...
          if (sampleCount) {
            avgPhoto = photoAccum / sampleCount;
            if (avgPhoto > 0 && avgPhoto < 1024) {
              rawPhoto = avgPhoto;
              //console.log( "Avg'd rawPhoto= " + rawPhoto );
              //console.log( "sampleCount= "+ sampleCount);
              //console.log("photoAccum= " + photoAccum);
              //console.log();
            }
          }
        }
      }
    }

    if (parts[0] == 'PI') { // EBB Pin Input return prefix


      if (WAITING_THETA_HOMED) {

        if (parseInt(parts[1], 10) == homingThHitState) {
          THETA_HOMED = true;
        } else {
          THETA_HOMED = false;
          RETESTCOUNTER = 0;
        }

        return;
      }

      if (WAITING_RHO_HOMED) {
        if (parseInt(parts[1], 10) == homingRHitState) {
          RHO_HOMED = true;
        } else {
          RHO_HOMED = false;
          // RETESTCOUNTER = 0; // !! Messes up Jimmy Homing
        }

        return;
      }
    }

    if (parts[0] == 'I') { // EBB read al1 inputs
      if (data.length == 21) { // valid "I" return
        //logEvent(1, data);
        //logEvent(1, data.length);
        var num = parseInt(parts[4], 10);

        //logEvent(1, num);
        //console.log( "Theta fault pin = " + (num & 2));
        //console.log(  "Rho fault pin = " + (num & 1));
        //console.log(  "Th home pin = " + (num & 4));
        if (useFaultSensors) {
          var thFaultState, rFaultState;
          var thHomeState, rHomeState;
          if (servo_wait_before_faulting) {
            logEvent(2, "NOT checking faults yet, servo needs more time first");
          } else {
            if ((num & 2) > 0) {
              thFaultState = 1;
            } else {
              thFaultState = 0;
            }
            if ((num & 1) > 0) {
              rFaultState = 1;
            } else {
              rFaultState = 0;
            }
            if (thFaultState == faultActiveState && rFaultState == faultActiveState) {
              logEvent(2, "Theta and Rho faulted!");
              onServoThRhoFault();
            } else if (thFaultState == faultActiveState) {
              logEvent(2, "Theta faulted!");
              onServoThFault();
            } else if (rFaultState == faultActiveState) {
              logEvent(2, "Rho faulted!");
              onServoRhoFault();
            }
          }
        }
        if ((num & 4) > 0) {
          thHomeState = 1;
        } else {
          thHomeState = 0;
        }
        if (thHomeState == homingThHitState) {
          //console.log(  "Theta at home");
          THETA_HOMED = true;
        } else {
          THETA_HOMED = false;
        }

        num = parseInt(parts[3], 10);
        // logEvent(0, "R home pin = " + (num & 64));
        if ((num & 64) > 0) {
          rHomeState = 1;
        } else {
          rHomeState = 0;
        }
        if (rHomeState == homingRHitState) {
          // logEvent(0, "Rho at home");
          RHO_HOMED = true;
        } else {
          RHO_HOMED = false;
        }
      }

    }


  }
}
/* ------------------------------
 * - External Library Interface -
 * ------------------------------ */

// Called when a track has completed.
var onFinishTrack = function() {};

// Called when the plotter state changes from/to any of waiting, homing, or playing.
var onStateChanged = function() {};

// Called when theta fault detected
var onServoThFault = function() {};

// Called when rho fault detected
var onServoRhoFault = function() {};

// Called when th && rho fault detected
var onServoThRhoFault = function() {};

module.exports = {

  // Update the global configuration variables with data form a config file.
  setConfig: function(config) {
    logEvent(1, "Set Config");

    plotRadius = config.radius;
    thSPRev = config.stepsPerThetaRevolution;
    rSPRev = config.stepsPerRadiusRevolution;
    rSPInch = config.stepsPerRadiusInch;
    useHomeSensors = config.useHomeSensors;

    JOGTHSTEPS = config.jogStepsTheta;
    JOGRSTEPS = config.jogStepsRadius;

    nestedAxisSign = config.nestedAxisSign;
    thDirSign = config.directionSignTheta;
    rDirSign = config.directionSignRadius;

    homingRPin = config.homingRPin;
    homingThPin = config.homingThPin;

    HOMETHSTEPS = config.homingThSteps * thDirSign;
    HOMERSTEPS = config.homingRSteps;

    // Jimmy Homing
    if (config.useJimmyHoming) useJimmyHoming = config.useJimmyHoming;
    if (config.homingRSpanSteps) HOMERSPANSTEPS = config.homingRSpanSteps;

    homingThHitState = parseInt(config.homingThHitState, 10)
    homingRHitState = parseInt(config.homingRHitState, 10)

    // Recalculate values the depend on the config.
    rthAsp = rSPRev / thSPRev;
    thSPRad = thSPRev / (2 * Math.PI);

    THETA_HOME_MAX = Math.round(thSPRev * 1.03 / HOMETHSTEPS); //3% extra
    // logEvent(1, 'T H MAX= '+THETA_HOME_MAX);
    RHO_HOME_MAX = Math.round(rSPInch * (plotRadius + 0.25) / HOMERSTEPS); // 1/4" extra

    // Servo values
    if (config.isServo) {
      useFaultSensors = config.isServo;
      IS_SERVO = config.isServo;
    }
    if (config.faultActiveState)  faultActiveState = config.faultActiveState;
    if (config.twoBallEnabled)    twoBallEnabled = config.twoBallEnabled;

    // LED Values
    logEvent(1, "Use RGBW config:", _.keys(config).join(','));
    if (config.useRGBW !== undefined) {
      logEvent(1, "Use RGBW config:", config.useRGBW);
      useLED = !config.useLED;
      useRGBW = config.useRGBW;
    }
  },


  allowFaultChecking() {
    servo_wait_before_faulting = false;
  },

  // The serial port connection is negotiated elsewhere. This method takes that
  // serial port object and saves it for communication with the bot.
  useSerial: function(serial) {
    sp = serial;

    if (IS_SERVO) {
      servo_wait_before_faulting = true;
      setTimeout(function(this2) {
        this2.allowFaultChecking();
      }, 15000, this);
    }
    logEvent(1, '#useSerial', sp.path, 'isOpen:', sp.isOpen);

    sp.on('data', parseReceivedSerialData);
    sp.write('CU,1,0\r'); // turn off EBB sending "OK"s

    sp.write('AC,0,1\r'); // turn on analog channel 0 for current reading Theta
    sp.write('AC,1,1\r'); // turn on analog channel 1 for current reading R
    sp.write('PD,B,3,1\r'); //set analog pin to input
    sp.write('AC,9,1\r'); // turn on analog channel 9 for reading photosensor

    sp.write('AC,8,0\r'); // turn off analog channel 8 for servo enable line
    sp.write('AC,10,0\r'); // turn off analog channel 10 for servo enable line
    sp.write('PD,B,1,0\r'); //set B1 to output for Rho en/disable
    sp.write('PD,B,2,0\r'); //set B2 to output for Theta en/disable

    sp.write('PO,B,1,1\r'); //set B1 high to enable Rho
    sp.write('PO,B,2,1\r'); //set B2 high to enable Theta

    if (useLED) sp.write("SE,1,100\r"); //turn on low lighting

    checkPhoto(); //start ambient light sensing
  },

  useLCPSocket: function (newsock) {
    sp_lcp = newsock;
  },

  // Returns the current state of the machine activity.
  // waiting, playing, homing
  getState: function() {
    return STATUS;
  },

  getThetaHome: function() {
    return THETA_HOMED;
  },

  getRhoHome: function() {
    return RHO_HOMED;
  },

  // Set a calback to be executed when a track is complete.
  onFinishTrack: function(fn) {
    onFinishTrack = fn;
  },

  // Set a callback to be executed when the plotter changes state.
  // This function should expect two arguments: newState, oldState.
  onStateChanged: function(fn) {
    onStateChanged = fn;
  },

  onServoThFault: function(fn) {
    onServoThFault = fn;
  },

  onServoRhoFault: function(fn) {
    onServoRhoFault = fn;
  },

  onServoThRhoFault: function(fn) {
    onServoThRhoFault = fn;
  },

  // Move the theta motor a single nudge
  jogThetaRight: function() {
    jog('theta', 'pos');
  },

  // Move the theta motor a single nudge
  jogThetaLeft: function() {
    jog('theta', 'neg');
  },

  // Move the rho motor a single nudge outward
  jogRhoOutward: function() {
    jog('rho', 'pos');
  },

  // Move the rho motor a single nudge inward
  jogRhoInward: function() {
    jog('rho', 'neg');
  },

  // Pause drawing.
  pause: function() {
    if (options.pause) {
      pauseRequest = true;
    } else {
      logEvent(1, 'cannot pause');
    }
  },

  // Resume drawing.
  resume: function() {
    if (options.play && verts.length > 0) {
      go();
    } else {
      logEvent(1, 'cannot play');
    }
  },

  // Plot a track, with some motion config meta data.
  playTrack: function(track) {
    logEvent(1, "TRACKNAME = " + track.name);
    if (twoBallEnabled && track.id) { // make sure id exists
      if (track.id == "attach") {
        balls = 2;
      }
      if (track.id == "detach") {
        balls = 1;
      }
    }

    // Save the track data
    verts = track.verts;
    miMax = verts.length - 1;

    // Save the motion config
    Vball = track.vel;
    Accel = track.accel;
    MTV = track.thvmax;

    // Log status
    logEvent(1,
      'Plotter: playing track with config:',
      Vball, Accel, MTV,
      'vertices:',
      verts.length,
      'balls: ' + balls
    );

    // Go!
    Rmi = 0;

    paused = false;
    setStatus('playing');
    nextMove(Rmi);
  },

  // get the autodim toggle value
  setAutodim: function(value) {
    autodim = value;
    logEvent(1, "autodim = " + autodim);

    if (autodim == 'true') {
      photoArray.fill(photoMin);
      checkPhoto();
    }
  },

  // get the brightness slider value
  setBrightness: function(value) {
    sliderBrightness = value;
		// logEvent(1, "sb: " + sliderBrightness);

    if (autodim !== 'true') {
      if (value == 0) {
				sp.write("SE,0\r");
        pwm = 0;
      } else {
        // convert to an integer from 0 - 1023, parabolic scale.
        // var pwm = value * 20;
        var pwm = Math.pow(2, value * 10); // - 1;
        pwm = Math.round(pwm);
        if (pwm <= 0) pwm = 1; // must be at lease one
        else if (pwm > 1023) pwm = 1023; // cannot be greater than 1023

				if (useLED) sp.write("SE,1," + pwm +"\r");
      }
  		logEvent(1, "brightness: " + value + " pwm: " + pwm);
      lastPhotoOut = pwm;
  	}
  },

  // set useLED
  setLED: function(value) {
    logEvent(1, "Set LED "+value);
    useLED = value;
    if (useLED == false) sp.write("SE,0\r");
  },

  // Set a speed scalar where 1 is normal, 2 is double
  // speed, and 0.5 is half speed.
  setSpeed: function(speed) {
    Voverride = speed;
  },

  // Retrieve the current speed sclar.
  getSpeed: function() {
    return Voverride;
  },

  getThetaPosition: function() {
  	var thetaDistHome, modRads, rawRads, shortestRads;

  	rawRads = thAccum / thSPRad;
  	// logEvent(1, "thAccum is " + thAccum + " steps");
  	// logEvent(1, "raw Theta postion is " + rawRads + " rads");

  	modRads = rawRads % (2 * Math.PI);
  	// logEvent(1, "modRads = " + modRads);

  	shortestRads = modRads*-1; //this is verified correct - but theta sign is wrong :(

  	if (modRads > Math.PI){
  		shortestRads = 2 * Math.PI - modRads; //shortestRads = modRads - 2 * Math.PI;
  	}
  	if (modRads < -1 * Math.PI){
  		shortestRads = -2 * Math.PI - modRads; //shortestRads = modRads + 2 * Math.PI;
  	}

    return shortestRads;
  },

  getRhoPosition: function() {

    //rSeg = (rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign/ rSPInch;

    return ((rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign / rSPInch) / plotRadius;
  },

  getBalls: function() {
    return balls;
  },

  // Find the ball and reset it's position.
  home: function() {
    if (pauseRequest) return; // don't allow homing during deceleration

    if (options.home) {
      if (useHomeSensors) {
        // Use above homing sensors routine.
        THETA_HOME_COUNTER = 0;
        RHO_HOME_COUNTER = 0;
        setStatus('homing');
        goThetaHome();

      } else {

        // Say we're home right here where everything lies.
        setStatus('homing');
        logEvent(1, 'Current THETA/RHO set as HOME');
        thAccum = rAccum = 0;
        THETA_HOMED = RHO_HOMED = true;

        setTimeout(function() {
          setStatus('waiting');
        }, 1)
      }
    }
  },
}
