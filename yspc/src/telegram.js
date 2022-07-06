
const TG = require( 'telegram-bot-api' );
const fs = require( 'fs' );
const https = require( 'https' );
const Stream = require( 'stream' ).Transform;
const FormData = require( 'form-data' );


// Global variables

var telegramAPI = null;
var botToken = null;
var privateChatId = null;
var telegramMessageProvider = null;
var shownMenus = [ ];

var recordingStateIntervalId = 0;

var tg = {

	menusEnabled: false,
	menusByName: { },

	startTelegram: startTelegram,
	stopTelegram: stopTelegram,
	createMenu: createMenu,
	createYesNoMenu: createYesNoMenu,
	sendMenu: sendMenu,
	clearAllMenus: clearAllMenus,
	isMenuShown: isMenuShown,
	sendTextMessage: sendTextMessage,
	deleteMessage: deleteMessage,
	deleteMessageThen: deleteMessageThen,
	sendVideoFile: sendVideoFile,
	sendPhoto: sendPhoto,
	getFile: getFile,
	downloadTelegramFile: downloadTelegramFile,

	parseUserInput: null

};


// Functions

function startTelegram( botTokenParam, privateChatIdParam, parseUserInput, onStarted ) {

	tg.parseUserInput = parseUserInput;
	botToken = botTokenParam;
	privateChatId = privateChatIdParam;
	if ( isNaN( privateChatId ) ) privateChatId = null;

	telegramAPI = new TG( {
		token: botToken
	} );

	telegramMessageProvider = new TG.GetUpdateMessageProvider();

	telegramAPI.setMessageProvider( telegramMessageProvider );

	telegramAPI.start().then( () => {

		console.log( "Telegram API is started" );

		onStarted();

	} )
	.catch( err => {

		console.error( "Telegram API error: " + err );

	} );

	// Receive messages via event callback
	telegramAPI.on( "update", processTelegramUpdate );

	//telegramAPI.getMe().then(console.log).catch(console.error);

}

function stopTelegram() {

	if ( telegramAPI ) telegramAPI.stop();
	telegramAPI = null;

}

function processTelegramUpdate( update ) {

	//console.log( update );

	if ( update.message ) {

		if ( ! checkPrivateMessage( update.message ) ) {

			return;

		}

		tg.parseUserInput( update.message );

	}
	else if ( update.callback_query ) {

		if ( ! checkPrivateMessage( update.callback_query.message ) ) return;

		// User has selected a menu option

		var entryData = update.callback_query.data.split( '*' );
		if ( entryData.length !== 2 ) return;
		var menuName = entryData[ 0 ];
		var optionIndex = parseInt( entryData[ 1 ] );

		var menu = tg.menusByName[ menuName ];

		if ( ! menu ) {

			console.log( "Error: menu not found: " + menuName );
			console.log( "Menus:" );
			console.log( tg.menusByName );
			return;

		}

		if ( menu && menu.enabled && menu.menuFunction ) {

			var optionLabel = menu.menuLabelsFunction()[ optionIndex ]

			//console.log( "Executing option: " + optionLabel );

			menu.menuFunction( optionIndex, optionLabel );

		}

	}

}

function checkPrivateMessage( message ) {

	if ( ! message ) return false;

	if ( ( message.chat.id !== privateChatId ) && ( privateChatId ) ) {

		if ( serverConfig.intruderAlert ) {

			var intruderAlertMessage = "Intruder alert!!!!\nSomeone has tried to use this Telegram bot." +
				"\nnick: " + message.from.username +
				"\nname: " + message.from.first_name +
				"\nlast name:" + message.from.last_name +
				"\nforwarded:" + ( !! message.forward_from ) +
				"\ntext: " + message.text;

			console.log( intruderAlertMessage );

			// Send intruder alert message
			tg.sendTextMessage( intruderAlertMessage );

			// Send some info to the intruder
			tg.sendTextMessage( "Hello! This is a personal bot for domotic use.\nFor more info please visit the project home at Github:\nhttps://github.com/yomboprime/RaspiGarage", message.chat.id );

		}

		return false;

	}
	else if ( ! privateChatId ) {

		console.log( "Nick: " + message.from.username + ", Name: " + message.from.first_name + "\nuser id: " + message.chat.id );
		return false;

	}

	return true;

}

function createMenu( name, optionsPerRow, rowIsMajorOrder, menuLabelsFunction, menuFunction ) {

	// 'menuLabelsFunction' is a function that returns array of string labels
	// 'options' is an array of functions

	var menu = {
		name: name,
		additionalText: null,
		enabled: true,
		optionsPerRow: optionsPerRow,
		rowIsMajorOrder: rowIsMajorOrder,
		menuLabelsFunction: menuLabelsFunction,
		menuFunction: menuFunction
	};

	if ( tg.menusByName[ name ] === undefined ) tg.menusByName[ name ] = menu;

	return menu;

}

function createYesNoMenu( name, yesLabel, yesFunction, noLabel, noFunction, dontClearMenus ) {

	createMenu( name, 2, false,

		function () {

			var menuLabels = [ ];

			menuLabels.push( yesLabel );
			menuLabels.push( noLabel );

			return menuLabels;

		},
		function ( optionIndex, optionLabel ) {

			if ( ! dontClearMenus ) clearAllMenus();

			switch ( optionLabel ) {

				case yesLabel:
					if ( yesFunction ) yesFunction();
					break;

				case noLabel:
					if ( noFunction ) noFunction();
					break;

				default:
					// Nothing to do
					break;
			}

		}
	);

}

function clearAllMenus() {

	for ( var i = 0, il = shownMenus.length; i < il; i ++ ) {

		deleteMessage( shownMenus[ i ].messageId );
		if ( shownMenus[ i ].messageIdAdditionalText ) deleteMessage( shownMenus[ i ].messageIdAdditionalText );

	}

	shownMenus = [ ];

}

function isMenuShown( menuName ) {

	for ( var i = 0, il = shownMenus.length; i < il; i ++ ) {

		if ( menuName === shownMenus[ i ].name ) return true;

	}

	return false;

}

function sendTextMessage( text, chat_id ) {

	chat_id = chat_id === undefined ? privateChatId : chat_id;

	if ( ! chat_id ) return;

	telegramAPI.sendMessage( {
		chat_id: chat_id,
		text: text,
		parse_mode: 'Markdown'
	} ).catch( console.error );

}

function deleteMessage( message_id, chat_id ) {

	chat_id = chat_id === undefined ? privateChatId : chat_id;

	if ( ! chat_id ) return;

	telegramAPI.deleteMessage( {
		chat_id: chat_id,
		message_id: message_id
	} ).catch( console.error );

}

function deleteMessageThen( message_id, callback, chat_id ) {

	chat_id = chat_id === undefined ? privateChatId : chat_id;

	if ( ! chat_id ) return;

	telegramAPI.deleteMessage( {
		chat_id: chat_id,
		message_id: message_id
	} ).then( callback ).catch( console.error );

}

function sendMenu( menu ) {

	if ( ! privateChatId ) return;

	if ( ! menu ) {

		console.log( "Error: sendMenu(): menu is undefined." );
		return;

	}

	if ( ! tg.menusEnabled ) return;

	var options = [ ];
	var labels = menu.menuLabelsFunction();
	var iColumn = 0;
	var row = [ ];

	for ( var i = 0; i < labels.length; i ++ ) {

		if ( ! labels[ i ] ) continue;

		var optionIndex = i;
		if ( menu.rowIsMajorOrder ) {

			var numberOfRows = Math.floor( labels.length / menu.optionsPerRow );
			var x = i % menu.optionsPerRow;
			var y = Math.floor( i / menu.optionsPerRow );
			optionIndex = x * numberOfRows + y;

		}

		var option = {
			text: labels[ optionIndex ],
			callback_data: menu.name + '*' + optionIndex
		};

		row[ iColumn ] = option;

		iColumn ++;
		if ( iColumn >= menu.optionsPerRow ) {

			iColumn = 0;
			options.push( row );
			row = [ ];

		}

	}

	var shownMenu = {
		name: menu.name,
		messageId: null,
		messageIdAdditionalText: null
	}
	shownMenus.push( shownMenu );

	telegramAPI.sendMessage( {
		chat_id: privateChatId,
		text: menu.name,
		parse_mode: 'Markdown',
		reply_markup: {
			inline_keyboard: options
		}
	} ).then( ( message1 ) => {

		shownMenu.messageId = message1.message_id;

		if ( menu.additionalText ) {

			telegramAPI.sendMessage( {
				chat_id: privateChatId,
				text: menu.additionalText,
				parse_mode: 'Markdown',
			} ).then( ( message2 ) => {

				shownMenu.messageIdAdditionalText = message2.message_id;

			} ).catch( console.error );
		}

	} ).catch( console.error );

}

function sendVideoFile( caption, videoPath, onSent ) {

	if ( ! privateChatId ) return;

	telegramAPI.sendVideo( {
		caption: caption,
		chat_id: privateChatId,
		video: fs.createReadStream( videoPath )
	} ).then( onSent ).catch( console.error );

}

function sendPhoto( caption, imagePath, disable_notification, onSent ) {

	if ( ! privateChatId ) return;

	telegramAPI.sendPhoto( {
		caption: caption,
		chat_id: privateChatId,
		photo: fs.createReadStream( imagePath ),
		disable_notification: "" + disable_notification
	} ).then( onSent ).catch( console.error );

}

function setRecordingStateOn( setOn ) {

	// TODO old

	if ( ! privateChatId ) return;

	function sendAction() {

		var recording = false;
		for ( var i = 0; i < numberOfCameras; i ++ ) {

			if ( cameras[ i ].timer > 0 ) {

				recording = true;
				break;
			}

		}

		if ( recording ) {

			telegramAPI.sendChatAction( { chat_id: privateChatId, action: "record_video" } ).catch( console.log ) ;

		}
		else {

			clearInterval( recordingStateIntervalId );
			recordingStateIntervalId = 0;

		}

	}

	if ( setOn ) {

		if ( recordingStateIntervalId ) return;

		sendAction();

		recordingStateIntervalId = setInterval( sendAction, 4800 );

	}
	else {

		if ( ! recordingStateIntervalId ) return;

		clearInterval( recordingStateIntervalId );
		recordingStateIntervalId = 0;

	}

}

function getFile( file_id, callback ) {

	telegramAPI.getFile( { file_id: file_id } ).catch( ( error ) => {

		callback( null, error );

	} ).then( ( file ) => {

		callback( file, null );

	} );

}

function downloadTelegramFile( telegramFile, localPath, callback ) {

	var uri = "https://api.telegram.org/file/bot" + botToken + "/" + telegramFile.file_path;

	https.request( uri, function( response ) {

		var data = new Stream();
		var isError = false;

		response.on( 'error', function( err ) {

			isError = true;

		} );

		response.on( 'data', function( chunk ) {

			data.push( chunk );

		} );

		response.on( 'end', function() {

			if ( ! isError ) {

				var contents = data.read();

				// Write the image to its directory
				fs.writeFile( localPath, contents, () => {

					callback( true );

				} );

			}
			else callback( false );

		} );

	} ).end();

}

function uploadFileToTelegram( localPath, contentType, callback ) {

	// Not tested

	var uri = 'https://api.telegram.org/bot' + botToken + '/sendDocument';

	var formData = new FormData();
	formData.append( 'chat_id', privateChatId );
	formData.append( 'document', fs.createReadStream( localPath ), { filename: 'image.png', contentType: 'image/png' } );

	var req = https.request( uri, { method: 'post', headers: formData.getHeaders() } );
	formData.pipe( req );

	var isError = false;

	req.on( 'response', function( response ) {

		response.on( 'error', function( err ) {

			isError = true;

		} );

		response.on( 'end', function() {

			callback( isError );

		} );

	} );

}

if ( typeof module !== 'undefined' ) {

	module.exports = tg;

}
