
// Global variables

let socket;
let accessToken = null;


// Main code

init();


// Functions

function init() {

	initNetwork();

}

function initNetwork() {

	const urlParams = new URLSearchParams( window.location.search );
	if ( urlParams.get( 'accessToken' ) ) accessToken = urlParams.get( 'accessToken' );

	const location = document.location;

	socket = new WebSocket( "ws://" + location.host );

	socket.onopen = function() {
		console.log( "Connection open." );
	};

	socket.onerror = function( data ) {
		console.log( "Connection Error: " + data );
	};

	socket.onclose = function() {
		console.log( "Connection Closed." );
	};


	socket.onmessage = function wsOnMessage( e ) {

		processMessage( e.data );

	};

}

function showMessage( text ) {
	
	const span = document.createElement( 'span' );
	span.innerHTML = text;
	document.body.appendChild( span );
	
}

function processMessage( data ) {

	//if ( data instanceof ArrayBuffer ) {
	if ( data instanceof Blob ) {

		// Binary message

		//console.log( "Binary message." );

		//socket.send( '{ "frame": true }' );

	}
	else {

		// JSON message

		const message = JSON.parse( data );
		if ( ! message ) {

			console.warn( "Error parsing JSON WebSockets message." );
			return;

		}

		console.log( message );

		switch ( message.type ) {

			case 'init':
				console.log( "Received init message " );
				socket.send( JSON.stringify(
					{
						type: "accessToken",
						accessToken: accessToken
					}
				) );
				break;

			case 'frame':
				showMessage( "Received FRAME" );
				break;

			case 'info':
				console.log( "Info: " + message.text );
				break;
				
			case 'warning':
				console.log( "Warning: " + message.text );
				break;
				
			case 'error':
				console.log( "Error: " + message.text );
				break;

			default:
				break;

		}

	}

}

function getFilenameExtension( path ) {

	path = path || "";

	const pathLastIndexOfDot = path.lastIndexOf( "." );

	if ( pathLastIndexOfDot > 0 && path.length > pathLastIndexOfDot + 1 ) {

		return path.substring( pathLastIndexOfDot + 1 );

	}
	else return "";

}

function createScrolledDiv( childDiv ) {

	var scrolledDiv = document.createElement( 'div' );
	scrolledDiv.style.overflowY = "scroll";
	scrolledDiv.appendChild( childDiv );
	return scrolledDiv;

}

function createDataList( id, array ) {


	const dataList = document.createElement( 'datalist' );
	dataList.id = id;

	for ( let i in array ) {

		const option = document.createElement( 'option' );
		option.value = array[ i ];
		dataList.appendChild( option );

	}

	return dataList;

}

function initGUI() {

	const openProjectIconPath = './icons/tango/tango/Document-open.svg';
	const refreshProjectIconPath = './icons/tango/tango/View-refresh.svg';
	const saveAllFilesIconPath = './icons/tango/tango/Media-floppy.svg';
	const closeFileIconPath = './icons/tango/tango/Dialog-error-round.svg';

	// Main divs

	iconBarDIV = document.createElement( 'div' );
	infoBarDIV = document.createElement( 'div' );
	fileBarDIV = document.createElement( 'div' );

	iconBarDIV.style.position = 'absolute';
	//iconBarDIV.style.display = 'flex';
	iconBarDIV.style.alignItems = 'left';
	iconBarDIV.style.width = '100%';
	iconBarDIV.style.height = ICON_BAR_HEIGHT + 'px';
	iconBarDIV.style.top = '0px';
	iconBarDIV.style.left = '0px';

	infoBarDIV.style.position = 'absolute';
	infoBarDIV.style.width = '100%';
	infoBarDIV.style.height = INFO_BAR_HEIGHT + 'px';
	infoBarDIV.style.bottom = '0px';
	infoBarDIV.style.left = '0px';

	fileBarDIV.style.position = 'absolute';
	fileBarDIV.style.width = FILE_BAR_WIDTH + 'px';
	fileBarDIV.style.height = '100%';
	fileBarDIV.style.top = ICON_BAR_HEIGHT + 'px';
	fileBarDIV.style.left = "0px";

	editorDIV = document.createElement( 'div' );
	editorDIV.style.fontSize= '18px';
	editorDIV.style.position = 'absolute';
	editorDIV.style.width = '800px';
	editorDIV.style.height = '600px';
	editorDIV.style.top = ICON_BAR_HEIGHT + 'px';
	editorDIV.style.left = FILE_BAR_WIDTH + 'px';


	// Icon bar

	function createButton( iconPath, tooltip, onClick ) {

		const button = document.createElement( 'span' );
		//button.style.flex = '1';
		button.style.width = ICON_BAR_HEIGHT + 'px';
		button.style.height = ICON_BAR_HEIGHT + 'px';
		button.style.marginLeft = '5px';
		button.style.marginRight = '5px';
		const image = document.createElement( 'img' );
		image.src = iconPath;
		button.addEventListener( 'click', onClick, false );
		if ( tooltip ) button.title = tooltip;
		button.appendChild( image );

		return button;

	}

	const refreshProjectButton = createButton( refreshProjectIconPath, translation[ "Refresh files list" ], refreshProject );
	iconBarDIV.appendChild( refreshProjectButton);

	const openProjectButton = createButton( openProjectIconPath, translation[ "Open project" ], openProjectFunc );
	iconBarDIV.appendChild( openProjectButton );

	const saveAllFilesButton = createButton( saveAllFilesIconPath, translation[ "Save all files" ], saveAllFiles );
	iconBarDIV.appendChild( saveAllFilesButton );

	closeFileButton = createButton( closeFileIconPath, translation[ "Close file" ], closeFileFunc );
	setButtonDisabled( closeFileButton, true );
	iconBarDIV.appendChild( closeFileButton );

	document.body.appendChild( iconBarDIV );
	document.body.appendChild( infoBarDIV );
	document.body.appendChild( fileBarDIV );
	document.body.appendChild( editorDIV );

	editor = ace.edit( editorDIV, {
		/*mode: "ace/mode/javascript",
		selectionStyle: "text"*/
	} );

	editor.setTheme( 'ace/theme/ambiance' );
	//editor.setDisplayIndentGuides( false );
	editor.setShowFoldWidgets( false );
	editor.setShowInvisibles( true );
	editor.setPrintMarginColumn( - 1 );
	editor.session.setTabSize( 4 );

	editor.on( 'change', () => {

		const doUpdate = ! editorIsDirty && filesList;

		editorIsDirty = true;

		if ( doUpdate ) filesList.updateDirtyFlags();

	} );

	window.addEventListener( 'resize', onWindowResize );

	onWindowResize();

}

function setButtonDisabled( button, disabled ) {

	if ( disabled ) button.style.opacity = "30%";
	else button.style.opacity = "100%";

	button.disabled = disabled;

}

function onWindowResize() {

	const w = window.innerWidth;
	const h = window.innerHeight;
/*
	const editorWidth = Math.max( 0, w - FILE_BAR_WIDTH );
	const editorHeight = Math.max( 0, h - ICON_BAR_HEIGHT - INFO_BAR_HEIGHT );

	fileBarDIV.style.height = editorHeight + "px";
	fileBarDIV.style.top = ICON_BAR_HEIGHT + "px";
	fileBarDIV.style.left = "0px";

	editorDIV.style.width = editorWidth + "px";
	editorDIV.style.height = editorHeight + "px";

	editor.resize();
*/
}

function createImageURLFromContent( content, type ) {

    return window.URL.createObjectURL( new Blob( [ content ], { type: type } ) );

}

function createPNGFromContent( content ) {

    return createImageURLFromContent( content, "image/png" );

}

function createJPEGFromContent( content ) {

    return createImageURLFromContent( content, "image/jpeg" );

}

function createSVGFromContent( content ) {

    return createImageURLFromContent( content, "image/svg+xml" );

}