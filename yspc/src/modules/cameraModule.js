
// Requires

const v4l2camera = require( 'v4l2camera-pr48' );


// Global variables

var api = null;
var mod = null;

const videoDevice = "/dev/video2";
const videoType = "MJPG";
//const videoType = "YUYV";

const xres = 640;
const yres = 480;
const fps = 30;

let webcam;
let frameRequested = false;

function init( moduleParam, apiParam ) {

	api = apiParam;
	mod = moduleParam;

	webcam = new v4l2camera.Camera( videoDevice );
	
	/*
	for ( let i = 0; i < webcam.formats.length; i ++ ) {
		const c1 = webcam.formats[ i ];
		console.log( "Format: " + c1.formatName + ", " + c1.format + ", " + c1.width + ", " + c1.height + ", " + ( c1.interval.denominator / c1.interval.numerator ) );
	}
	*/

	let selFormat = null;
	for ( let i = 0; i < webcam.formats.length; i ++ ) {

		const c1 = webcam.formats[ i ]

		if ( c1.formatName === videoType && c1.width === xres && c1.height === yres && ( c1.interval.denominator / c1.interval.numerator ) === fps ) {

			selFormat = c1;

		}

	}

	if ( ! selFormat ) {

		return "Can't find webcam video mode: " + xres + "x" + yres + "@" + fps + " FPS";

	}
	
	webcam.configSet( selFormat );
	
	webcam.start();
	
	setTimeout( function () {

		console.log( "Capturing webcam..." );

		time = process.hrtime();

		webcam.capture( onCaptured );

	}, 1000 );

	return null;

}

function finish( onFinished ) {
	
	onFinished();
	
}

function onClientConnected() {
}

function onClientDisconnected() {

}

function onCaptured( success ) {

	// Get frame
	const frameJPG = webcam.frameRaw();
	
	// Send frame
	if ( frameRequested ) {

		const client = api.getClient();
		if ( client ) client.socket.send( frameJPG );
		frameRequested = false;

	}

	// Capture next frame
	webcam.capture( onCaptured );

}

function processMessage( message ) {
	
	
	switch ( message.type ) {
				
		case 'frameRequest':
			frameRequested = true;
			break;
				
	}
	
}

if ( typeof module !== 'undefined' ) {

	module.exports = {
		name: "Camera",
		init: init,
		finish: finish,
		processMessage: processMessage,
		onClientConnected: onClientConnected,
		onClientDisconnected: onClientDisconnected
	};

}
