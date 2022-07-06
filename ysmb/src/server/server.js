
// - Requires -

const fs = require( 'fs' );
const pathJoin = require( 'path' ).join;

const WebAppServer = require( "./WebAppServer.js" );
const serverUtils = require( "./serverUtils.js" );
const ws = require( 'ws' );

// - Global variables -

let webAppServer = null;
let wss = null;
let webClient = null;
let wsClient = null;

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

	createWebServer();
	
	createWSServer();

}

function createWebServer() {

	webAppServer = new WebAppServer( console.log );
	webAppServer.start( {
		"host": "",
		"listenPort": 8093,
		"connectionTimeout": 1000000,
		"restrictToLocalHost": true
	}, {
		onStartServer: function() {
			console.log( "Web server started." );
		},
		onClientConnection: function( client ) {
			
			console.log( "Client connected." );
			
			webClient = client;

			client.socket.onerror = function( data ) {

				console.log( "Client Error: " + data );
				webClient = null;

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
							if ( wsClient ) wsClient.socket.send( JSON.stringify( message ) );
							else error( client, "No server connection." )
							break;

					}

				}

			};

			client.socket.send( JSON.stringify( {
				type: 'init'
			} ) );

		},
		onClientDisconnection: function() {

			console.log( "Client disconnected." );
			webClient = null;

		}
	} );
}

function createWSServer() {

	wss = new ws.Server( { port: 8091 } );
	
	wss.on( 'connection', function( socket, req ) {

		const client = {
			isGod: false,
			socket: socket,
		};
		
		wsClient = client;

		console.log( "WS Client connected." );

		socket.on( "close", function( msg ) {

			console.log( "WS Client disconnected." );
			wsClient = null;

		} );

		client.socket.onmessage = function( data ) {

			const message = JSON.parse( data.data );

			if ( message ) {

				console.log( "WS Client message received: " + data.data );

				switch ( message.type ) {

					default:
						if ( wsClient === client && webClient ) {

							webClient.socket.send( data.data );
						}
						break;

				}

			}

		};

    } );

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
