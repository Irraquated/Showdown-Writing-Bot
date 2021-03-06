/**
 * This is the main file of Pokémon Showdown Bot
 *
 * Some parts of this code are taken from the Pokémon Showdown server code, so
 * credits also go to Guangcong Luo and other Pokémon Showdown contributors.
 * https://github.com/Zarel/Pokemon-Showdown
 *
 * @license MIT license
 */

global.info = function(text) {
	if (config.debuglevel > 3) return;
	if (!colors) global.colors = require('colors');
	console.log('info'.cyan + '  ' + text);
};

global.debug = function(text) {
	if (config.debuglevel > 2) return;
	if (!colors) global.colors = require('colors');
	console.log('debug'.blue + ' ' + text);
};

global.recv = function(text) {
	if (config.debuglevel > 0) return;
	if (!colors) global.colors = require('colors');
	console.log('recv'.grey + '  ' + text);
};

global.cmdr = function(text) { // receiving commands
	if (config.debuglevel !== 1) return;
	if (!colors) global.colors = require('colors');
	console.log('cmdr'.grey + '  ' + text);
};

global.dsend = function(text) {
	if (config.debuglevel > 1) return;
	if (!colors) global.colors = require('colors');
	console.log('send'.grey + '  ' + text);
};

global.error = function(text) {
	if (!colors) global.colors = require('colors');
	console.log('error'.red + ' ' + text);
};

global.ok = function(text) {
	if (config.debuglevel > 4) return;
	if (!colors) global.colors = require('colors');
	console.log('ok'.green + '    ' + text);
};

global.toId = function(text) {
	return text.toLowerCase().replace(/[^a-z0-9]/g, '');
};

global.toTitleCase = function(str) {
    var strArr = str.split(' ');
    var newArr = [];
    for (var i = 0; i < strArr.length; i++) {
        newArr.push(strArr[i].charAt(0).toUpperCase() + strArr[i].slice(1));
    }
    str = newArr.join(' ');
    return str;
};

global.stripCommands = function(text) {
	text = text.trim();
	switch (text.charAt(0)) {
	case '/':
		return '/' + text;
	case '!':
		return '!' + text;
	case '>':
		if (text.substr(0, 3) === '>> ' || text.substr(0, 4) === '>>> ') return ' ' + text;
		/* fall through */
	default:
		return text;
	}
};

function runNpm(command) {
	console.log('Running `npm ' + command + '`...');

	var child_process = require('child_process');
	var npm = child_process.spawn('npm', [command]);

	npm.stdout.on('data', function(data) {
		process.stdout.write(data);
	});

	npm.stderr.on('data', function(data) {
		process.stderr.write(data);
	});

	npm.on('close', function(code) {
		if (!code) {
			child_process.fork('main.js').disconnect();
		}
	});
}

// Check if everything that is needed is available
try {
	require('sugar');
	require('colors');
} catch (e) {
	console.log('Dependencies are not installed!');
	return runNpm('install');
}

if (!Object.select) {
	console.log('Node needs to be updated!');
	return runNpm('update');
}

// First dependencies and welcome message
var sys = require('sys');
global.colors = require('colors');

console.log('----------------------'.yellow);
console.log('| Welcome to AxeBot. |'.yellow);
console.log('----------------------'.yellow);
console.log('');

// Config and config.js watching...
global.fs = require('fs');
if (!('existsSync' in fs)) {
	fs.existsSync = require('path').existsSync;
}

if (!fs.existsSync('./config.js')) {
	error('config.js doesn\'t exist; are you sure you copied config-example.js to config.js?');
	process.exit(-1);
}

global.config = require('./config.js');

var checkCommandCharacter = function() {
	if (!/[^a-z0-9 ]/i.test(config.commandcharacter)) {
		error('invalid command character; should at least contain one non-alphanumeric character');
		process.exit(-1);
	}
};

checkCommandCharacter();

var watchFile = function() {
	try {
		return fs.watchFile.apply(fs, arguments);
	} catch (e) {
		error('your version of node does not support `fs.watchFile`');
	}
};

if (config.watchconfig) {
	watchFile('./config.js', function(curr, prev) {
		if (curr.mtime <= prev.mtime) return;
		try {
			delete require.cache[require.resolve('./config.js')];
			config = require('./config.js');
			info('reloaded config.js');
			checkCommandCharacter();
		} catch (e) {}
	});
    
}

// And now comes the real stuff...
info('starting server');

var WebSocketClient = require('websocket').client;
global.Commands = require('./commands.js').commands;
global.Parse = require('./parser.js').parse;

var connection = null;
global.send = function(data) {
	if (!connection.connected) return false;
	if (!Array.isArray(data)) data = [data.toString()];
	data = JSON.stringify(data);
	dsend(data);
	connection.send(data);
};

var connect = function(retry) {
	if (retry) {
		info('retrying...');
	}

	var ws = new WebSocketClient();

	ws.on('connectFailed', function(err) {
		error('Could not connect to server ' + config.server + ': ' + sys.inspect(err));
		info('retrying in one minute');

		setTimeout(function() {
			connect(true);
		}, 60000);
	});

	ws.on('connect', function(con) {
		connection = con;
		ok('connected to server ' + config.server);

		con.on('error', function(err) {
			error('connection error: ' + sys.inspect(err));
		});

		con.on('close', function() {
			// Is this always error or can this be intended...?
			error('connection closed: ' + sys.inspect(arguments));
			info('retrying in one minute');

			setTimeout(function() {
				connect(true);
			}, 60000);
		});

		con.on('message', function(message) {
			if (message.type === 'utf8') {
				recv(sys.inspect(message.utf8Data));
				Parse.data(message.utf8Data);
			}
		});
	});

	// The connection itself
	var id = ~~(Math.random() * 900) + 100;
	var chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
	var str = '';
	for (var i = 0, l = chars.length; i < 8; i++) {
		str += chars.charAt(~~(Math.random() * l));
	}

	var conStr = 'ws://' + config.server + ':' + config.port + '/showdown/' + id + '/' + str + '/websocket';
	info('connecting to ' + conStr + ' - secondary protocols: ' + sys.inspect(config.secprotocols));
	ws.connect(conStr, config.secprotocols);
};

connect();

var stdin = process.openStdin();
if (config.rooms.length > 0) {
    var currentRoom = config.rooms[0];
} else {
    var currentRoom = config.privaterooms[0];
}
console.log("Now initiating direct control over chat input.");
console.log("Type '" + config.commandcharacter + "' without the quotation marks, followed by the room name to ");
console.log("speak to a certain room from that point onwards.");
console.log("I am currently speaking to room " + toTitleCase(currentRoom));
stdin.addListener("data", function(d) {
    om = d.toString().substring(0, d.length-1);
    if(om.substr(0, config.commandcharacter.length) === config.commandcharacter) {
        currentRoom = toId(om.substr(config.commandcharacter.length));
        return console.log("Understood. From this point forwards, I shall speak in room " + toTitleCase(currentRoom));
    }
    else if(currentRoom === "") {
            return console.log("Please select a room, first.");
    }
    Parse.say(currentRoom, om);
});
