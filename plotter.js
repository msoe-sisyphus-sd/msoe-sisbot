var util = require('util');
var path = require('path');
var fs = require('fs');// for file reading
var config = require('./config');

{//globals:
var Vball=2,  Accel = 2, MTV=0.5, Vmin = 0.1, Voverride = 1;
var balls  = 1; //sis vs tant mode
//machine constants:
var plotRadius = 13.5, segRate=20;
var thSPRev = 40888.88888888888889, rSPRev = 3200, rSPInch = 2573.2841325173814;
var nestedAxisSign = 1, thDirSign = 1, rDirSign = -1;

var rthAsp = rSPRev / thSPRev; //r-th aspect ratio
var rCrit = Vball / MTV;
var thSPRad = thSPRev / (2* Math.PI);
var accelSegs = Vball * segRate /(2 * Accel);  //console.log('accelSegs: '+accelSegs );
var VminSegs =  Vmin * segRate /(2 * Accel); // console.log('VminSegs:'+VminSegs);
var ASfin = accelSegs;
var ASindex = VminSegs; //accelSegs index
var baseMS = 1000/segRate; //msec per segment, no V adjustment

var useHomeSensors; // True if the bot has sensors. Otherwise the current position is considered home.
var homingThPin; // SBB board pin for homing theta sensor
var homingRPin; // SBB board pin for homing rho sensor
var homingThHitState; // The value the sensor reports when triggered. 0 or 1.
var homingRHitState; // The value the sensor reports when triggered. 0 or 1.

var useFaultSensors = 1; // True if the bot has sensors. Otherwise the current position is considered home.
//var faultThPin = "D,1"; // SBB board pin for homing theta sensor
//var faultRPin = "D,0"; // SBB board pin for homing rho sensor
//var faultThActiveState = 1; // The value the sensor reports when triggered. 0 or 1.
//var faultRActiveState = 1; // The value the sensor reports when triggered. 0 or 1.
faultActiveState = 0;

var STATUS = 'waiting'; //vs. playing, homing
var options = {  //user commands available
  pause : false,
  play : true,
  home : true,
  jog : true,
  speed : true,
  content : true
};

var verts = []; //array of path vertices
var vert = {th : 0, r : 0}; //vertex object
var miMax, thAccum=0, rAccum=0;
var pauseRequest= false;

var sp // serial port

var paused = true;
//pars stored for pause/resume:
var Rmi, RmiMax, Rsi, RsiMax, RthStepsSeg, RrStepsSeg;
var  RthLOsteps, RrLOsteps, ReLOth, ReLOr, RfracSeg;

var RDIST = 0, THRAD = 0, MOVEDIST = 0, RSEG = 0;
var RF2MIN = 1;
var JOGTHSTEPS = 100, JOGRSTEPS = 100;
var HOMETHSTEPS = 30 * thDirSign, HOMERSTEPS = 30 ;

var COUNTER =0;

var THETA_HOME_COUNTER  = 0, THETA_HOMED, WAITING_THETA_HOMED;
var THETA_HOME_MAX; //=  Math.round(thSPRev * 1.03 / HOMETHSTEPS);//3% extra

var RHO_HOME_COUNTER = 0, RHO_HOMED, WAITING_RHO_HOMED;
var RHO_HOME_MAX; //=  Math.round(rSPInch * (plotRadius + 0.25) / HOMERSTEPS);// 1/4" extra
var RETESTCOUNTER = 0, RETESTNUM = 5;
var THETA_FAULTED, R_FAULTED;

var plistRepeat = true;
var PLHOMED = false;
var ABLETOPLAY = true;
var moment = require("moment");

//globals for autodimming:
var rawPhoto = 1;  //raw photosensor 10-bit analog value
var rawPhotoLast = 1;
var photoArraySize = 16; //higher-->slower change
var photoArray = [];
photoArray.length = photoArraySize;
photoArray.fill(0);
var BR = 1; // user brightness scalar 0-1
var BRamp = 2; //BR multiplier
var photoAvgOld = 0;
var photoSum = 0;
var photoMin = 5; //minimum non-off LED brightness
var photoMsec = 250; // -sample potosensor every.  higher-->slower change
var sliderBrightness;

var maTheta; //Theta current
var maR;     //R current
var Vm;      //motor voltage

}

function checkPhoto() { //autodimming functionality:
	var photo, photoAvg = 0, delta;

	if (useFaultSensors){
		checkFault();

	}




	sp.write("A\r"); //SBB command to check analog inputs

	if (rawPhoto > 0)  { //skip very low as spurious vals
		photo = rawPhoto;//(1023 - rawPhoto);
		if (photo > 1023) {photo = 1023;}
		if (photo < 1) {photo = 1;}
		console.log("raw photo = " + photo)

		photoSum -= photoArray.shift(); //delete first val in array and subtract from sum
		photoSum += photoArray[photoArray.push(photo) - 1]; //add val to end and add it
		photoAvg = Math.round(photoSum * BR * BRamp/ photoArraySize);

		delta = photoAvg - photoAvgOld;

		if (Math.abs(delta) / photoAvgOld > 0.01) {
			if (delta > 0) {
				photoAvg *= 1.01;
			}

			else {photoAvg /= 1.01;}

		if (sliderBrightness > 0.5){
			photoAvg *= Math.pow(5,sliderBrightness * 2) - 4;
		}
		else {
			photoAvg *= sliderBrightness * 2;
		};


			if ((photoAvg > 0) && (photoAvg <= photoMin)) {photoAvg = photoMin;}
			if (photoAvg > 1023) {photoAvg = 1023};

			//console.log("photoAvg = " + photoAvg);

			if (Math.round(photoAvg) != Math.round(photoAvgOld)) {
					if (Math.round(photoAvg) != 0) {
					sp.write("SE,1," + Math.round(photoAvg) +"\r");
console.log("SE,1," + Math.round(photoAvg))

				}
				else {sp.write("SE,0\r")}
				console.log("SE,1," + Math.round(photoAvg))
				photoAvgOld = photoAvg;
			}
		}
	}
	if (STATUS != 'homing'){ //stop photosensing if homing
	setTimeout(checkPhoto, photoMsec);
	}
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
        pause : false,
        play : true,
        home : true,
        jog : true,
        speed : true,
        content : true
      };
      return;

    case 'playing':
      options = {
        pause : true,
        play : false,
        home : false,
        jog : false,
        speed : true,
        content : false
      };
      return;

    case 'homing':
      options = {
        pause : true,
        play : false,
        home : false,
        jog : false,
        speed : false,
        content : false
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
  // console.log(util.inspect(process.memoryUsage()));

  // if `mi` isn't set, we're starting a new track, so start at zero.
  mi = mi || 0;

  // log progress, without scrolling thousands of lines.
  /*
	process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write('progress: ' + mi + ' / ' + miMax);
	*/

  if (mi >= miMax){
    console.log('all moves done');
    console.log('thAccum = ' + thAccum);
    console.log('rAccum = ' + rAccum);
    verts = []; //clear verts array

    onFinishTrack();
    setStatus('waiting');
    return;
  }

  thOld = verts[mi].th; rOld = verts[mi].r;

  if (mi == 0) {
    console.log('COUNTER:', ++COUNTER);
    correctGap();
  }

  thNew = verts[mi+1].th; rNew= verts[mi+1].r;

  moveThRad = thNew - thOld;
  THRAD = moveThRad;
  moveRdist = (rNew - rOld) * plotRadius;
  RDIST = moveRdist;

  moveThDist = moveThRad * rCrit;
  moveDist = Math.sqrt((moveThDist * moveThDist) +
                       (moveRdist * moveRdist));
  MOVEDIST = moveDist;

  headingNow = Math.atan2(moveRdist, moveThDist);

  if(mi<miMax-1) lookAhead(mi, headingNow);
  else ASfin = VminSegs; //next move is last

  segsReal = moveDist * segRate / Vball;
  segs = Math.floor(segsReal);

  //deal with tiny moves here:
  if (segs == 0) {
    segs = 1;
    fracSeg = segsReal;
    //console.log('TINY MOVE, frac= '+segsReal)
  }
  else fracSeg=1;

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
//  console.log(rStepsComp + '*');

  rStepsComp = Math.floor(thStepsNew * rthAsp * nestedAxisSign) -
                    Math.floor(thStepsOld * rthAsp * nestedAxisSign);

  //console.log(rStepsComp + '');

  //rStepsComp = Math.floor(thStepsMove * rthAsp )* nestedAxisSign;
  //console.log(rStepsComp + '*');


  rStepsMove += rStepsComp;

  thStepsSeg = Math.floor(thStepsMove / segs);
  thLOsteps = thStepsMove - thStepsSeg * segs; //th Left Over steps

  rStepsSeg = Math.floor(rStepsMove / segs);
  rLOsteps = rStepsMove - rStepsSeg * segs; //r Left Over steps

  //console.log('move ' + mi + ' of ' + miMax);

  nextSeg(mi, miMax,0,segs, thStepsSeg, rStepsSeg,
        thLOsteps, rLOsteps, 0, 0, fracSeg);

}
//////      NEXTSEG     ///////////////////////////////////
function nextSeg(mi, miMax ,si, siMax, thStepsSeg, rStepsSeg,
                thLOsteps, rLOsteps, eLOth, eLOr, fracSeg) {
  var msec = baseMS;
  var cmd;
  var thLOsign=0, rLOsign=0;
  var thStepsOut, rStepsOut;
  var rSeg, rEffect, rFactor1, rFactor2;

  if (si==siMax){
    //console.log('move '+mi+' done, ' + counter + ' segs');
    mi++;
    nextMove(mi);
    return;
  }
  //ACCEL/DECEL ---------------------------
  if (!pauseRequest){
    //console.log(ASindex);
    if ((ASindex > ASfin) && (ASindex - ASfin > siMax-si)) ASindex--;//decel;
    else {
      if (ASindex < accelSegs) ASindex++; //accel
      if (ASindex > accelSegs) ASindex = accelSegs; //updates Accel changes ?--;?
    }
  }
  else {  //pause requested:
    console.log('decelerating...');
    //console.log(ASindex);
    if (ASindex <= VminSegs) {
      ASindex = VminSegs;
      console.log('PAUSED, waiting...');
      paused = true;
      pauseRequest = false;
      setStatus('waiting');

      //record current segment pars:
      Rmi=mi;    RmiMax=miMax;    Rsi=si;    RsiMax=siMax;
      RthStepsSeg=thStepsSeg;    RrStepsSeg=rStepsSeg;
      RthLOsteps=thLOsteps;    RrLOsteps=rLOsteps;
      ReLOth=eLOth;  ReLOr=eLOr;  RfracSeg = fracSeg;

      return; //break the nextSeg chain = being paused
    }
    else ASindex--; //decel on the way to being paused
  }
  //------------------------------------
  if (ASindex < VminSegs) ASindex = VminSegs;
  msec *= Math.sqrt(accelSegs / ASindex);
  msec /= Voverride;
  msec *= fracSeg;
  //console.log(fracSeg);
  //------------------------------------

  rSeg = (rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign/ rSPInch;
  RSEG = rSeg;
  //console.log('rSeg: ' + Math.floor(rSeg*1000)/1000);
  if (balls == 1) rEffect = rSeg; //sis
  else rEffect = plotRadius/2 + Math.abs(Radius/2 - rSeg); //tant

  if (rEffect > rCrit) { //ball is outside rCrit:
      rFactor1 = Math.sqrt((RDIST * RDIST +
                  THRAD * THRAD * rEffect * rEffect)) / MOVEDIST;
      //console.log('rFactor1: ' + rFactor1);
      msec *= rFactor1;
  }
  else { //ball is inside rCrit-- this is shaky at best...
    if (rSeg > RF2MIN) {
      rFactor2 = Math.abs((RDIST / MOVEDIST) * (rCrit / rSeg));
    }
    else {
      rFactor2 = Math.abs((RDIST / MOVEDIST) * (rCrit / RF2MIN));
    }
    rFactor2 *= 0.7; //just empirical tweak downward
    //console.log('rFactor2: ' + rFactor2);
    if (rFactor2 < 1) rFactor2 = 1;
    msec *= rFactor2;
  }

  //------------------------------------

  thStepsOut = thStepsSeg;
  rStepsOut = rStepsSeg;

  if (thLOsteps < 0) thLOsign = -1;  else thLOsign = 1;
  if (rLOsteps < 0) rLOsign = -1;  else rLOsign = 1;

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

  msec = Math.floor(msec);  if (msec < 1) msec = 1;
  cmd = "SM,"+msec+","+thStepsOut+","+rStepsOut+ "\r";

  sp.write(cmd, function(err, res) {
    sp.drain(function(err, result) {
      if (err) {console.log(err, result);}
      else {
        //console.log (cmd);
        si++;
        thAccum += thStepsOut;
        rAccum += rStepsOut;

        nextSeg(mi, miMax, si, siMax, thStepsSeg, rStepsSeg,
                thLOsteps, rLOsteps, eLOth, eLOr, 1);
      }
    });
  });
}

//////      LOOK AHEAD     ///////////////////////////////////
function lookAhead(mi, heading) {
    var LAthDist = (verts[mi+2].th - verts[mi+1].th) * rCrit;
    var LArDist = (verts[mi+2].r - verts[mi+1].r) * plotRadius;

    //console.log('current heading: '+ heading);

    var LAheading = Math.atan2(LArDist, LAthDist)
    //console.log('LA heading: '+ LAheading)

    var dHeading = LAheading - heading;
    dHeading = Math.abs(dHeading);

    var inertiaFactor = Math.sin(dHeading/2);
    //console.log('inertiaFactor: '+ inertiaFactor);
    ASfin = accelSegs*(1-inertiaFactor);//+1?
    //console.log('ASfin: '+ ASfin);
}

function go() {
  paused=false;
  setStatus('playing');
  nextSeg(Rmi, RmiMax, Rsi, RsiMax, RthStepsSeg, RrStepsSeg,
                        RthLOsteps, RrLOsteps, ReLOth, ReLOr, RfracSeg);
}

//////      GO THETA HOME    ///////////////////////////////////
function goThetaHome() {
  var thetaHomingStr, thetaHomeQueryStr = "PI," + homingThPin + "\r";
	//Theta home pin B7 sbb1, D2 sbb1.1, (C0 ebb)//R home pin C6

	WAITING_THETA_HOMED = true;

  if (pauseRequest) {
    pauseRequest = false;
    setStatus('waiting');
    console.log('theta homing aborted');

		setTimeout(checkPhoto, photoMsec); //restart photosensing for autodim

    return;
  }

  if (THETA_HOME_COUNTER == THETA_HOME_MAX) {
    console.log('Failed to find Theta home!');
    logEvent('Th homing failure ');
    //setStatus('waiting');
		thAccum = 0;
		WAITING_THETA_HOMED = false;
		setStatus('home_th_failed');

		setTimeout(checkPhoto, photoMsec); //restart photosensing for autodim
    return;
  }

	sp.write(thetaHomeQueryStr);

	if (!THETA_HOMED) { //not home yet, move toward home:

		var rCompSteps = Math.round(HOMETHSTEPS * rthAsp * nestedAxisSign) * thDirSign;
		thetaHomingStr = "SM,"+ baseMS + "," + HOMETHSTEPS * thDirSign+ "," + rCompSteps + "\r";

		THETA_HOME_COUNTER++;
		if (config.debug) console.log (THETA_HOME_COUNTER);

		sp.write(thetaHomingStr, function(err, res) {
			sp.drain(function(err, result) {
				if (err) {console.log(err, result);}
				else {
					if (config.debug) console.log (thetaHomingStr);
					WAITING_THETA_HOMED = true;

					goThetaHome();
				}
			});
		});

	}

	else { //Theta home sensor activated, confirm it:

		if (RETESTCOUNTER < RETESTNUM) {//not fully confirmed yet:
			RETESTCOUNTER++;
			if (config.debug) console.log("RETESTCOUNTER: " + RETESTCOUNTER);
			sp.write(thetaHomeQueryStr, function(err, res) {
				sp.drain(function(err, result) {
					if (err) {console.log(err, result);}
					else {
						if (config.debug) console.log (thetaHomeQueryStr);
						WAITING_THETA_HOMED = true;
						//allow time for return of sensor state:
						setTimeout(goThetaHome, 15);


						//goThetaHome();
					}
				});
			});
		}

		else { //passed retesting so truly home:
			thAccum = 0;
			THETA_HOME_COUNTER = 0;
			console.log('THETA AT HOME!');
			RETESTCOUNTER = 0;
			WAITING_THETA_HOMED = false;
			//WAITING_RHO_HOMED = true;

console.log('finding R home...');

			setTimeout(goRhoHome, 150);

		}


	}

}

//////      GO RHO HOME    ///////////////////////////////////
function goRhoHome() {
  var rhoHomingStr, rhoHomeQueryStr = "PI," + homingRPin + "\r";
	//R home pin C6

	WAITING_RHO_HOMED = true;

  if (pauseRequest) {
    pauseRequest = false;
    setStatus('waiting');
    console.log('theta homing aborted');
  setTimeout(checkPhoto, photoMsec); //restart photosensing for autodim
    return;
  }

  if (RHO_HOME_COUNTER == RHO_HOME_MAX) {
    console.log('Failed to find Rho home!');
    logEvent('R homing failure ');
    //setStatus('waiting');
    rAccum = 0;
    WAITING_RHO_HOMED = false; // stop trying to home
		setStatus('home_rho_failed');
    return;
  }

	sp.write(rhoHomeQueryStr);

	if (!RHO_HOMED) { //not home yet, move toward home:

		rhoHomingStr = "SM,"+ baseMS + "," + 0 + "," + -HOMERSTEPS * rDirSign + "\r";

		RHO_HOME_COUNTER++;
		console.log (RHO_HOME_COUNTER);

		sp.write(rhoHomingStr, function(err, res) {
			sp.drain(function(err, result) {
				if (err) {console.log(err, result);}
				else {
					console.log (rhoHomingStr);
					WAITING_RHO_HOMED = true;

					goRhoHome();
				}
			});
		});

	}

	else { //Rho home sensor activated, confirm it:

		if (RETESTCOUNTER < RETESTNUM) {//not fully confirmed yet:
			RETESTCOUNTER++;
			console.log("RETESTCOUNTER: " + RETESTCOUNTER);
			sp.write(rhoHomeQueryStr, function(err, res) {
				sp.drain(function(err, result) {
					if (err) {console.log(err, result);}
					else {
						console.log (rhoHomeQueryStr);
						WAITING_RHO_HOMED = true;
						//allow time for return of sensor state:
						setTimeout(goRhoHome, 15);

					}
				});
			});
		}

		else { //passed retesting so truly home:
			thAccum = 0;
			THETA_HOME_COUNTER = 0;
			console.log('THETA AT HOME!');
			RETESTCOUNTER = 0;
			WAITING_THETA_HOMED = false;

			rAccum = 0;
			RHO_HOME_COUNTER = 0;
			console.log('RHO AT HOME!');
			RETESTCOUNTER = 0;
			WAITING_RHO_HOMED = false;

			logEvent('homed');

			if (PLHOMED) { //homed from playlist
				setStatus('playing');
				if (PLAYTYPE == 'shuffle') { //relevant only for homes in shuffleplay
					plistLines.splice(PLINDEX,1); //pluck out plLines[PLINDEX]
					//console.log(plistLines);
					REMAINING--;
				}
				nextPlaylistLine(PLINDEX, plLinesMax);
			}
			else { //homed manually
				setStatus('waiting');
			}

			setTimeout(checkPhoto, photoMsec); //restart photosensing for autodim

			return;

		}

	}

}

//////      FAULT DETECTION     ///////////////////////////////////
function checkFault() {
	//Theta fault pin = D,1 / R fault pin = D,0

	sp.write("I\r");
	//console.log(thetaFaultQueryStr);
	//if (THETA_FAULTED){
	//	if (RETESTCOUNTER < RETESTNUM) //not fully confirmed yet:
		//	RETESTCOUNTER++;
	  //else{
		//	console.log("THETA AXIS FAULTED!")
		//	RETESTCOUNTER = 0;
			//stop program and alert user here
		//}
	//}
	//else{
		//RETESTCOUNTER = 0;
	//}
}
/*
function checkRhoFault() {
	//Rho fault pin = D,0
	var rhoFaultQueryStr = "PI," + faultRPin + "\r";
	sp.write(rhoFaultQueryStr);
	console.log(rhoFaultQueryStr);
	if (R_FAULTED){
		if (RETESTCOUNTER < RETESTNUM) //not fully confirmed yet:
			RETESTCOUNTER++;
	  else{
			console.log("R AXIS FAULTED!")
			RETESTCOUNTER = 0;
			//stop program and alert user here
		}
	}
	else{
		//RETESTCOUNTER = 0;
	}
}
*/

//////      JOG     ///////////////////////////////////
function jog(axis, direction) {
  var jogThsteps = 0, jogRsteps = 0;

  if (axis == "theta"){
    if (direction == 'pos') jogThsteps = JOGTHSTEPS * thDirSign;
    else jogThsteps = JOGTHSTEPS * -thDirSign ;

    jogRsteps = Math.round(jogThsteps * rthAsp * nestedAxisSign);
  }

  if (axis == "rho"){
    if (direction == 'pos') jogRsteps = JOGRSTEPS * rDirSign;
    else jogRsteps = JOGRSTEPS * -rDirSign;
  }

  sp.write("SM,"+baseMS+","+jogThsteps+","+jogRsteps+ "\r");

}

function reportRgap() {
  var Ractual;
  var Rinfile;

  Ractual = (rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign / rSPInch;
  Rinfile = verts[0].r * plotRadius;
  //console.log('Ractual: ' + Ractual);
  //console.log('Rinfile: ' + Rinfile);
  console.log('Rgap: ' + (Ractual - Rinfile));
  logEvent('Rgap: ' + (Ractual - Rinfile));
  logEvent('thAccum: ' + thAccum + '  rAccum: ' + rAccum);
}

function correctGap() {
  var Ractual;
  var Rinfile;
  var steps = 0;

  Ractual = (rAccum - thAccum * rthAsp * nestedAxisSign) * rDirSign / rSPInch;
  Rinfile = verts[0].r * plotRadius;
  steps  = Math.round((Ractual - Rinfile) * rSPInch) * -rDirSign;

  sp.write("SM,1,0,"+ steps + "\r", function(err, res) {
    sp.drain(function(err, result){
      if (err) {console.log(err, result);}
      else {
        console.log ('gap steps ' + steps);
          rAccum += steps;
      }
    });
  });
}

function logEvent(event) {
  // console.trace();
  // var eventText = event;
  // var now = moment(new Date());
  // var date = now.format("D MMM YYYY");
  // var time = now.format("HH:mm");
  //
  // eventText += ' -- ' + date + ' ' + time + '\r\n';
  //
  // fs.appendFile('sis.log' , eventText, function (err) {
  //   if (err) throw err;
  // });
}


{////////Serial Port events--//////////////////////////////////////////

}
function parseReceivedSerialData(data) {
  var parts;
	//remove any line breaks in string:
	data = String(data).replace(/(\r\n|\n|\r)/gm,"");

  if (config.debug) console.log("in " + data);
  parts = String(data).split(',');

  if (parts[0] == '!')  {console.log("EBB error: " + data);}
	else {

		if (parts[0] == 'A'){ //analog pin states
				//console.log(parts)

			if (data.length == 33){ //analog report came back complete
				if (parts[1]) {
					maTheta = Number(parts[1].slice(3,7)) * 707 * 3.3 / 1023 ;
					//console.log('Theta current = ' + Math.round(maTheta) + 'mA') ;
				}

				if (parts[1]) {
					maR = Number(parts[2].slice(3,7)) * 707 * 3.3 / 1023;
					//console.log('R current = ' + Math.round(maR) + 'mA') ;
				}

				if (parts[3]) {
					rawPhoto = Number(parts[3].slice(3,7));
					//console.log(rawPhoto);
				}

				if (parts[4]) {
					Vm = Number(parts[4].slice(3,7))*25*3.3/1023/2.717;
					//console.log("Vm= " + Math.round(Vm * 10)/10);
				}
			}
		}

		if (parts[0] == 'PI') {//EBB Pin Input return prefix


 			if (WAITING_THETA_HOMED) {

				if (parseInt(parts[1], 10) == homingThHitState)  {
					THETA_HOMED = true;
				}
				else {
					THETA_HOMED = false;
					RETESTCOUNTER = 0;
				}

				return;
			}

			if (WAITING_RHO_HOMED) {
				if (parseInt(parts[1], 10) == homingRHitState)  {
					RHO_HOMED = true;
				}
				else {
					RHO_HOMED = false;
					RETESTCOUNTER = 0;
				}

				return;
			}
		}

		if (parts[0] == 'I') {//EBB read al1 inputs
			if (data.length == 21){ //valid "I" return
				//console.log(data);
				//console.log(data.length);
			var num = parseInt(parts[4],10);

			//console.log(num);
			// console.log("Theta fault pin = " + (num & 2));
			// console.log("Rho fault pin = " + (num & 1));
			// console.log("Th home pin = " + (num & 4));

			var thFaultState, rFaultState;
			var thHomeState, rHomeState;
			if ((num & 2) > 0) {thFaultState = 1;} else {thFaultState = 0;}
			if (thFaultState == faultActiveState) {console.log("Theta faulted!");}
			if ((num & 1) > 0) {rFaultState = 1;} else {rFaultState = 0;}
			if (rFaultState == faultActiveState) {console.log("Rho faulted!");}

			if ((num & 4) > 0) {thHomeState = 1;} else {thHomeState = 0;}
			if (thHomeState == homingThHitState) {console.log("Theta at home");}


			num = parseInt(parts[3],10);
			console.log("R home pin = " + (num & 64));
			if ((num & 64) > 0) {rHomeState = 1;} else {rHomeState = 0;}
			if (rHomeState == homingRHitState) {console.log("Rho at home");}


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

module.exports = {

  // Update the global configuration variables with data form a config file.
  setConfig: function(config) {
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

    homingThHitState = parseInt(config.homingThHitState, 10)
    homingRHitState = parseInt(config.homingRHitState, 10)

    // Recalculate values the depend on the config.
    rthAsp = rSPRev / thSPRev;
    thSPRad = thSPRev / (2* Math.PI);

    THETA_HOME_MAX =  Math.round(thSPRev * 1.03 / HOMETHSTEPS);//3% extra
		console.log('T H MAX= '+THETA_HOME_MAX);
    RHO_HOME_MAX =  Math.round(rSPInch * (plotRadius + 0.25) / HOMERSTEPS);// 1/4" extra
  },


	// The serial port connection is negotiated elsewhere. This method takes that
	// serial port object and saves it for communication with the bot.
	useSerial: function(serial) {
		sp = serial;
		console.log('#useSerial', sp.path, 'isOpen:', sp.isOpen());

		sp.on('data', parseReceivedSerialData);
		sp.write('CU,1,0\r'); // turn off EBB sending "OK"s

		sp.write('AC,0,1\r'); // turn on analog channel 0 for current reading Theta
		sp.write('AC,1,1\r'); // turn on analog channel 1 for current reading R
		sp.write('PD,B,3,1\r'); //set analog pin to input
		sp.write('AC,9,1\r'); // turn on analog channel 9 for reading photosensor

		checkPhoto(); //start ambient light sensing

  },

  // Returns the current state of the machine activity.
  // waiting, playing, homing
  getState: function() {
    return STATUS;
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
      console.log('cannot pause');
    }
  },

  // Resume drawing.
  resume: function() {
    if (options.play && verts.length > 0) {
      go();
    } else {
      console.log('cannot play');
    }
  },

  // Plot a track, with some motion config meta data.
  playTrack: function(track) {
    // Save the track data
    verts = track.verts;
    miMax = verts.length - 1;

    // Save the motion config
    Vball = track.vel;
    Accel = track.accel;
    MTV = track.thvmax;

    // Log status
    console.log(
      'Plotter: playing track with config:',
      Vball, Accel, MTV,
      'vertices:',
      verts.length
    );

    // Go!
    Rmi = 0;

    paused = false;
    setStatus('playing');
    nextMove(Rmi);
  },

	// get the brightness slider value
  setBrightness: function(value) {
    sliderBrightness = value;
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

  // Find the ball and reset it's position.
  home: function() {
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
        console.log('Current THETA/RHO set as HOME');
        thAccum = rAccum = 0;
        THETA_HOMED = RHO_HOMED = true;

        setTimeout(function() {
          setStatus('waiting');
        }, 1)
      }
    }
  },
}
