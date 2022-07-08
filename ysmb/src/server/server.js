
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

			console.log( "Client connected." );

			const params = webAppServer..getURLParameters( client.req.url );
			let token = null;
			for ( let i = 0; i < params.length; i++ ) {
				if ( params[ i ].name === 'accessToken' ) {
					
					token = params[ i ].value;
					break;
					
				}
			}
			
			console.log( "Token: " );
			console.log( token );

			const tokenReg = consumeToken( token );
			if ( ! tokenReg ) {
				
				console.log( "Client NOT validated." );
				client.socket.terminate();
				return;
				
			}
			
			console.log( "Client validated." );
			
			if ( tokenReg.type === 'yspc' ) {
				
				wsClient = client;

			}
			else {

				webClient = client;

			}

			client.socket.onerror = function( data ) {

				console.log( "Client Error: " + data );

				if ( tokenReg.type === 'yspc' ) {
				
					wsClient = null;

				}
				else {

					webClient = null;

				}

			};

			client.socket.onmessage = function( data ) {

				const message = JSON.parse( data.data );

				if ( message ) {

					console.log( "Client message: " + data.data );

					switch ( message.type ) {

						case 'exit':
							beginAppTermination( EXIT_NO_ACTION );
							break;

						default:
						
							const otherClient = tokenReg.type === 'yspc' ? webClient : wsClient;
							//if ( otherClient ) otherClient.socket.send( data.data );
							if ( otherClient ) otherClient.socket.send( JSON.stringify( message ) );
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

			console.log( "Client disconnected." );

			if ( client === wsClient ) {
			
				wsClient = null;

			}
			else {

				webClient = null;

			}

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
		creation: new Date()
	} );

	return ( type === 'yspc' ? 'ws' : 'http' ) + '://yomboprime.org:45000?accessToken=' + token;

}

function purgueOldTokens() {
	
	const time = new Date();
	
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
console.log( "DEBUG 1" );
	if ( ! token ) return false;
console.log( "DEBUG 2" );	
	const time = new Date();
console.log( "DEBUG 3" );
	for ( let i = 0; i < activeTokens.length; i ++ ) {
console.log( "DEBUG 4" );
		const t = activeTokens[ i ];
		
		if ( token === t.token ) {
console.log( "DEBUG 5" );
			activeTokens.splice( i, 1 );
			purgueOldTokens();
			return t.creation + TOKEN_EXPIRATION_MS > time;
			
		}
		
	}
console.log( "DEBUG 6" );
	purgueOldTokens();
	return false;

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
