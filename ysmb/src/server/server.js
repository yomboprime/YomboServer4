
// - Requires -

const fs = require( 'fs' );
const pathJoin = require( 'path' ).join;
const WebAppServer = require( "./WebAppServer.js" );
const serverUtils = require( "./serverUtils.js" );
const tg = require( './telegram.js' );
const ws = require( 'ws' );

// - Global variables -

const TOKEN_EXPIRATION_MS = 30000;

let webAppServer = null;
let webClient = null;
let wsClient = null;

let activeTokens = [];

const CONFIG_PATH = "./config/config.json";
let serverConfig = null;

let isAppEnding = false;
let exitAction = null;
const EXIT_NO_ACTION = 0;
const EXIT_ERROR = 1;


// - Main code -

initServer();

// - End of main code -


// - Functions -

function initServer() {

	process.on( "SIGINT", function() {

		console.log( "  SIGINT Signal Received, shutting down" );

		beginAppTermination( EXIT_NO_ACTION );

	} );
	
	// Load config
	serverConfig = serverUtils.loadFileJSON( CONFIG_PATH, "utf8" );
	if ( serverConfig === null ) {

		console.log( "Error loading config file config/config.json. Please check its syntax." );
		process.exit( 1 );

	}

	const tok = serverUtils.loadFile( "./config/token", "utf8" ).split( "\n" )[ 0 ];
	const cid = parseInt( serverUtils.loadFile( "./config/chat_id", "utf8" ).split( "\n" )[ 0 ] );

	tg.startTelegram(
		tok,
		cid,
		parseUserInput,
		() => {

			tg.sendTextMessage( "ℹ️ " + "YSMB bot is online." );

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

	createWebServer();

}

function createWebServer() {

	webAppServer = new WebAppServer( console.log );
	webAppServer.start( {
		"host": "",
		"listenPort": 45000,
		"connectionTimeout": 1000000,
		"restrictToLocalHost": false
	}, {
		onStartServer: function() {
			console.log( "Web server started." );
		},
		onClientConnection: function( client ) {

			const params = webAppServer.getURLParameters( client.req.url );
			let token = null;
			for ( let i = 0; i < params.length; i++ ) {
				if ( params[ i ].name === 'accessToken' ) {
					
					token = params[ i ].value;
					break;
					
				}
			}

			console.log( "Client connected. Token: " + token );

			const tokenReg = consumeToken( token );
			if ( ! tokenReg ) {
				
				console.log( "Client NOT validated. Token: " + token );
				client.socket.terminate();
				return;
				
			}
			
			console.log( "Client validated. Token: " + token + ". Type: " + tokenReg.type );
			
			if ( tokenReg.type === 'yspc' ) wsClient = client;
			else webClient = client;

			client.socket.onerror = function( evt ) {

				console.log( "Client Error: " + evt + ". Token: " + token );

				if ( tokenReg.type === 'yspc' ) wsClient = null;
				else webClient = null;

			};

			client.socket.onmessage = function( evt ) {

				console.log( evt.data );
				
				const message = JSON.parse( evt.data );

				if ( message ) {

					console.log( "Client message: " + evt.data );

					switch ( message.type ) {

						case 'exit':
							beginAppTermination( EXIT_NO_ACTION );
							break;

						default:
						
							const otherClient = tokenReg.type === 'yspc' ? webClient : wsClient;
							if ( otherClient ) otherClient.socket.send( evt.data );
							else error( client, "No peer connection (type: " + tokenReg.type + ")." );
							break;

					}

				}

			};

			client.socket.send( JSON.stringify( {
				type: 'init'
			} ) );

		},
		onClientDisconnection: function( client ) {

			console.log( "Client disconnected. ");

			if ( client === wsClient ) wsClient = null;
			else webClient = null;

		}
	} );
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

	const command = text;
	
	console.log( "Received command: " + command );
	
	let url = null;
	
	switch ( command ) {
		
		case 'yspc':
			url = addToken( 'yspc' );
			break;
			
		case 'ysmb':
			url = addToken( 'ysmb' );
			break;
		
	}

	if ( url ) tg.sendTextMessage( url );
	
	purgueOldTokens();

}

function addToken( type ) {
	
	if ( activeTokens.length > 10 ) return null;
	
	const MAX_TOKEN = 1000000000;
	const token = "" + Math.floor( MAX_TOKEN * Math.random() );

	activeTokens.push( {
		token: token,
		type: type,
		creation: new Date().getTime()
	} );

	if ( type === 'yspc' ) return 'ws://yomboprime.org:45000?accessToken=' + token;
	else return 'http://yomboprime.org:45000/client.html?accessToken=' + token;

}

function purgueOldTokens() {
	
	const time = new Date().getTime();
	
	let i = 0;
	while ( i < activeTokens.length ) {
		
		const t = activeTokens[ i ];
		if ( t.creation + TOKEN_EXPIRATION_MS < time ) {
			
			activeTokens.splice( i, 1 );
			
		}
		else i ++;
		
	}
	}

function consumeToken( token ) {

	if ( ! token ) return null;

	const time = new Date().getTime();

	for ( let i = 0; i < activeTokens.length; i ++ ) {

		const t = activeTokens[ i ];
		
		if ( token === t.token ) {

			activeTokens.splice( i, 1 );
			purgueOldTokens();

			if ( t.creation + TOKEN_EXPIRATION_MS > time ) return t;
			else return null;
			
		}
		
	}

	purgueOldTokens();
	return null;

}

function info( client, text ) {

	client.socket.send( JSON.stringify( {
		type: 'info',
		text: text
	} ) );

}

function warning( client, text ) {

	client.socket.send( JSON.stringify( {
		type: 'warning',
		text: text
	} ) );

}

function error( client, text ) {

	client.socket.send( JSON.stringify( {
		type: 'error',
		text: text
	} ) );

}

function getPublicIP() {
	
	serverUtils.spawnProgram(
		null,
		"curl",
		[
			"ifconfig.me"
		],
		( code, output, error ) => {
			
			if ( code !== 0 ) {
				
				console.log( "Could not get public IP. Are you connected to the Internet?" );
				
			}
			else console.log( "IP=" + output );

		}

	);

}

function beginAppTermination( action ) {

	exitAction = action;

/*
	if ( cap ) {

		isAppEnding = true;

		//...

		finish();

	}
	else {

		finish();

	}

	shutdownCamera();
*/

	finish();

}

function finish() {

	function salute( err ) {

		if ( ! err ) console.log( "Application terminated successfully. Have a nice day." );
		else console.log( "Application terminated With error. Have a nice day." );

	}

	switch ( exitAction ) {

		case EXIT_NO_ACTION:
			salute( false );
			process.exit( 0 );
			break;

		case EXIT_ERROR:
			salute( true );
			process.exit( 0 );
			break;

		default:
			console.log( "Unknown exit code." );
			salute( false );
			process.exit( 0 );
			break;

	}

}
