
// - Requires -

const PNG = require( 'pngjs' ).PNG;
const fs = require( 'fs' );
const pathJoin = require( 'path' ).join;
const { spawn, exec } = require( 'child_process' );
const tg = require( './telegram.js' );
const ws = require( 'ws' );

// - Global variables -

const CONFIG_PATH = "./config/config.json";
let serverConfig = null;

let isAppEnding = false;
let modules;
let modulesByName;
let api;

// WS local client, connected to the server
let client;

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

			tg.sendTextMessage( "ℹ️ " + "YSPC bot is online." );

			//tg.menusEnabled = true;

			loadModules();

			if ( modules === null ) {

				console.log( "Error loading modules." );
				process.exit( 1 );

			}

		}

	);

}

function parseUserInput( message ) {

	//console.log( "Received message: " + message.text );

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

	const url = text;
	
	if ( ! url.startsWith( 'ws://yomboprime.org:45000?accessToken=' ) ) return;

	connectToServer( url );

}

function connectToServer( url ) {

	client = {
		url: url,
		connectionTimestamp: new Date().getTime(),
		socket: null
	};

	console.log( "Connecting..." );

	client.socket = new ws.WebSocket( url );
	
	client.socket.addEventListener( 'open', () => {
		
		console.log( "WS client opened." );
		tg.sendTextMessage( "Connection with server is open." );
		
		for ( let i = 0, il = modules.length; i < il; i ++ ) modules[ i ].onClientConnected();

	} );

	client.socket.addEventListener( 'close', () => {
		
		client = null;
		console.log( "WS client closed." );
		tg.sendTextMessage( "Connection with server is closed." );
		
		for ( let i = 0, il = modules.length; i < il; i ++ ) modules[ i ].onClientDisconnected();
		
	} );

	client.socket.addEventListener( 'message', ( data ) => {
		
		//console.log( "WS client message: " + data.data );

		const message = JSON.parse( data.data );

		if ( ! message ) return;

		const module = modulesByName[ message.module ];
		
		if ( ! module ) return;

		module.processMessage( message );

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
		localPath = pathJoin( localPath, ( new Date().getTime() ) + file.file_path.replace( '/', '_' ) );

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

function loadModules() {

	modules = [];
	modulesByName = {};

	modules.push( require( './modules/cameraModule.js' ) );

	for ( let i = 0, il = modules.length; i < il; i ++ ) {

		console.log( "Initing module '" + ( modules[ i ].name ? modules[ i ].name : 'unnamed' ) + "'." );

		if ( ! checkProperty( modules[ i ], 'name' ) ) return false;
		if ( ! checkProperty( modules[ i ], 'init' ) ) return false;
		if ( ! checkProperty( modules[ i ], 'finish' ) ) return false;
		if ( ! checkProperty( modules[ i ], 'processMessage' ) ) return false;
		if ( ! checkProperty( modules[ i ], 'onClientConnected' ) ) return false;
		if ( ! checkProperty( modules[ i ], 'onClientDisconnected' ) ) return false;

		function checkProperty( module, propertyName ) {
			
			if ( module[ propertyName ] === undefined ) {
				
				console.log( "Error: Module does not define the '" + + "' property." );
				return false;
				
			}
			
			return true;
			
		}

		// Set module config
		var config = serverConfig.modules[ modules[ i ].name ];
		if ( ! config ) {

			console.log( "Configuration for module '" + modules[ i ].name + "' was not found." );
			return false;

		}

		modules[ i ].config = config;

	}

	// Check duplicated names
	for ( var i = 0, n = modules.length; i < n - 1; i ++ ) {

		for ( var j = i + 1; j < n; j ++ ) {

			if ( modules[ i ].name === modules[ j ].name ) {

				console.log( "Error: duplicated module name: '" + modules[ i ].name + "'" );
				return false;

			}

		}

	}

	// Init modules
	api = createAPI();
	for ( var i = 0, il = modules.length; i < il; i ++ ) {

		const errorMessage = modules[ i ].init( modules[ i ], api )
		if ( errorMessage ) {

			console.log( "Error: Module '" + modules[ i ].name + "' was not inited properly. Error message: " + errorMessage );
			return false;
					}

	}

	for ( var i = 0, il = modules.length; i < il; i ++ ) {

		modulesByName[ modules[ i ].name ] = modules[ i ];
		
	}

	return true;

}

function stopModules( onDone ) {

	iterateAsync( modules, "finish", onDone );

}

function createAPI() {

	return {

		serverConfig: serverConfig,
		tg: tg,
		
		getClient: () => { return client; },

		spawnProgram: spawnProgram,
		execProgram: execProgram,

		pathJoin: pathJoin

	}

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

	//tg.clearAllMenus();
	tg.stopTelegram();

	stopModules( () => {

		exit( action );

	} );

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
