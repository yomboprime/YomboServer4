
// - Requires -

const PNG = require( 'pngjs' ).PNG;
const fs = require( 'fs' );
const pathJoin = require( 'path' ).join;
const { spawn, exec } = require( 'child_process' );

const tg = require( './src/telegram.js' );

const ws = require( 'ws' );

// - Global variables -

const CONFIG_PATH = "./config/config.json";
let serverConfig = null;

let isAppEnding = false;
let modules = [];
let api = null;

const USER_IDLE = 0;
let userResponseState = USER_IDLE;

const EXIT_NO_ACTION = 0;
const EXIT_ERROR = 1;
const EXIT_REBOOTING = 2;
const EXIT_POWER_OFF = 3;


// - Main code -

initServer();

// - End of main code -


// - Functions -

function initServer() {

	process.on( "SIGINT", function() {

		console.log( "  SIGINT Signal Received, shutting down" );

		finish( EXIT_NO_ACTION );

	} );

	// Load config
	serverConfig = loadFileJSON( CONFIG_PATH, "utf8" );
	if ( serverConfig === null ) {

		console.log( "Error loading config file config/config.json. Please check its syntax." );
		process.exit( 1 );

	}

	const tok = loadFile( "./config/token", "utf8" ).split( "\n" )[ 0 ];
	const cid = parseInt( loadFile( "./config/chat_id", "utf8" ).split( "\n" )[ 0 ] );

	tg.startTelegram(
		tok,
		cid,
		parseUserInput,
		() => {

			tg.sendTextMessage( "ℹ️ " + "Telegram bot has started." );

			//tg.menusEnabled = true;
/*
			modules = loadModules();
			if ( modules === null ) {

				console.log( "Error loading modules." );
				process.exit( 1 );

			}
*/

		}

	);

}

function parseUserInput( message ) {

	console.log( "Received message: " + message.text );

	if ( message.text ) {

		if ( message.text.length > 100 ) return;

		processPetition( message.text );

	}
	else if ( message.voice ) {

		//if ( serverConfig.enableVoicePlayback ) playVoiceFile( message.voice.file_id );

	}
	else if ( message.audio ) {

		//if ( serverConfig.enableVoicePlayback ) playVoiceFile( message.audio.file_id );

	}

}

function processPetition( text ) {

	if ( ! text.startsWith( 'IP=' ) ) return;

	const clientIP = text.substring( 'IP='.length );

	console.log( "Received petition: " + clientIP );

	const MAX_TOKEN = 1000000000;
	const token = "" + Math.floor( MAX_TOKEN * Math.random() );

	connectToClient( clientIP, token );

}

function connectToClient( ip, token ) {

	const client = {
		ip: ip,
		token: token,
		isValidated: false,
		connectionTimestamp: new Date(),
		socket: null
	};
	
	tg.sendTextMessage( "http://" + ip + ":8093/client.html?accessToken=" + token );

	console.log( "Connecting..." );
	
	const url = "ws://" + ip + ':8091';
	client.socket = new ws.WebSocket( url );
	
	client.socket.addEventListener( 'open', () => {
		
		console.log( "WS client opened." );

	} );

	client.socket.addEventListener( 'close', () => {
		
		console.log( "WS client closed." );
		
	} );

	client.socket.addEventListener( 'message', ( data ) => {
		
		console.log( "WS client message: " + data.data );

		const message = JSON.parse( data.data );

		if ( ! message ) return;

		
		if ( client.isValidated ) {

			switch ( message.type ) {
					
				case 'frameAck':
					break;
					
			}

		}
		else {

			if ( message.type === 'accessToken' ) {

				if ( message.accessToken === client.token ) {

					console.log( "WS client has been validated." );

					client.isValidated = true;

					client.socket.send( JSON.stringify( { type: 'frame' } ) );

				}

			}

		}

	} );

}

function playVoiceFile( file_id ) {

	// TODO old, change path

	tg.getFile( file_id, ( file, error ) => {

		if ( error ) {

			tg.sendTextMessage( "‼" + translation[ "Error downloading voice file." ] );
			return;

		}


		const localPath = pathJoin( serverConfig.captureVideosPath, "voiceMessages" );
		fs.mkdirSync( localPath, { recursive: true } );
		localPath = pathJoin( localPath, ( new Date() ).getTime() + file.file_path.replace( '/', '_' ) );

		tg.downloadTelegramFile( file, localPath, ( success ) => {

			if ( success ) {

				tg.sendTextMessage( "ℹ️" + translation[ "Playing voice file..." ] );

				spawnProgram( null, "ffplay", [ "-nodisp", "-volume", "100", "-autoexit", localPath ], ( code, output, error ) => {

					if ( code ) tg.sendTextMessage( "‼" + translation[ "Error playing voice file: " ] + error );
					else tg.sendTextMessage( "ℹ️" + translation[ "Voice file played successfully." ] );

					spawnProgram( null, "rm", [ localPath ], ( code, output, error ) => {} );

				} );

			}
			else {

				tg.sendTextMessage( "‼" + translation[ "Error downloading voice file." ] );

			}

		} );

	} );

}

function loadFileJSON( path, encoding ) {

	try {

		return JSON.parse( loadFile( path, encoding ) );

	}
	catch ( e ) {

		return null;

	}

}

function loadFile( path, encoding ) {

	try {

		return fs.readFileSync( path, encoding ? encoding : undefined );

	}
	catch ( e ) {

		return null;

	}

}

function saveConfig() {

	fs.writeFileSync( CONFIG_PATH, JSON.stringify( serverConfig, null, 4 ), "latin1" );

}

function spawnProgram( cwd, program, args, callback, cancelOutput ) {

	let p;

	if ( cwd ) p = spawn( program, args, { cwd: cwd } );
	else p = spawn( program, args );

	let output = "";
	let error = "";

	p.stdout.on( 'data', ( data ) => {

		if ( cancelOutput === false ) output += data;

	} );

	p.stderr.on( 'data', ( data ) => {

		error += data;

	} );

	p.on( 'exit', ( code, signal ) => {

		if ( callback ) {

			callback( code, output, error );

		}

	} );

}

function execProgram( cwd, command, callback, cancelOutput ) {

	// Executes in a shell

	let p;

	if ( cwd ) p = exec( command, { cwd: cwd } );
	else p = exec( command );

	let output = "";
	let error = "";

	p.stdout.on( 'data', ( data ) => {

		if ( cancelOutput === false ) output += data;

	} );

	p.stderr.on( 'data', ( data ) => {

		error += data;

	} );

	p.on( 'exit', ( code, signal ) => {

		if ( callback ) {

			callback( code, output, error );

		}

	} );

}

function finish( action ) {

	tg.clearAllMenus();
	tg.stopTelegram();

	//stopModules( () => {

		exit( action );

	//} )

}

function exit( action ) {

	function salute( err ) {

		if ( ! err ) console.log( "Application terminated successfully. Have a nice day." );
		else console.log( "Application terminated With error. Have a nice day." );

	}

	switch ( action ) {

		case EXIT_NO_ACTION:
			salute( false );
			process.exit( 0 );
			break;

		case EXIT_ERROR:
			salute( true );
			process.exit( 1 );
			break;

		case EXIT_REBOOTING:
			salute( false );
			spawnProgram( null, "sudo", [ "reboot" ], () => {
				process.exit( 0 );
			} );
			break;

		case EXIT_POWER_OFF:
			salute( false );
			spawnProgram( null, "sudo", [ "shutdown", "now" ], () => {
				process.exit( 0 );
			} );
			break;

		default:
			console.log( "Unknown exit code." );
			salute( false );
			process.exit( 0 );
			break;

	}

}

function iterateAsync( array, methodName, onDone ) {

	iterateAsyncInternal( 0 );

	function iterateAsyncInternal( index ) {

		if ( index >= array.length ) {

			onDone();

		}
		else {

			array[ index ][ methodName ]( () => {

				iterateAsyncInternal( index + 1 );

			} );

		}
	}

}
