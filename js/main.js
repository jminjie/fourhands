
/***************************************************************************r
 * *
* Initial setup
****************************************************************************/

var configuration = {
  'iceServers': [{
    'urls': 'stun:stun1.l.google.com:19302'
  }]
};

var sendBtn = document.getElementById('send');

// Attach event handlers
sendBtn.addEventListener('click', sendTestMessage);

// Disable send buttons by default.
sendBtn.disabled = true;

// Create a random room if not already present in the URL.
var isInitiator;

/**
var room = window.location.hash.substring(1);
if (!room) {
  room = window.location.hash = randomToken();
}
*/
var room = "theonlyroom";


/****************************************************************************
* Signaling server
****************************************************************************/

// Connect to the signaling server
var socket = io.connect();

socket.on('ipaddr', function(ipaddr) {
  console.log('Server IP address is: ' + ipaddr);
  // updateRoomURL(ipaddr);
});

socket.on('created', function(room, clientId) {
  console.log('Created room', room, '- my client ID is', clientId);
  isInitiator = true;
});

socket.on('joined', function(room, clientId) {
  console.log('This peer has joined room', room, 'with client ID', clientId);
  isInitiator = false;
  createPeerConnection(isInitiator, configuration);
});

socket.on('full', function(room) {
  alert('Room ' + room + ' is full. Try again later.');
});

socket.on('ready', function() {
  console.log('Socket is ready');
  createPeerConnection(isInitiator, configuration);
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

socket.on('message', function(message) {
  console.log('Client received message:', message);
  signalingMessageCallback(message);
});

// Joining a room.
socket.emit('create or join', room);

if (location.hostname.match(/localhost|127\.0\.0/)) {
  socket.emit('ipaddr');
}

// Leaving rooms and disconnecting from peers.
socket.on('disconnect', function(reason) {
  console.log(`Disconnected: ${reason}.`);
  sendBtn.disabled = true;
});

socket.on('bye', function(room) {
  console.log(`Peer leaving room ${room}.`);
  sendBtn.disabled = true;
  // If peer did not create the room, re-enter to be creator.
  if (!isInitiator) {
    window.location.reload();
  }
});

window.addEventListener('unload', function() {
  console.log(`Unloading window. Notifying peers in ${room}.`);
  socket.emit('bye', room);
});


/**
* Send message to signaling server
*/
function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

/****************************************************************************
* WebRTC peer connection and data channel
****************************************************************************/

var peerConn;
var dataChannel;

function signalingMessageCallback(message) {
    if (message == null) {
        console.log("signalingMessageCallback is ignoring null message");
        return;
    }
  if (message.type === 'offer') {
    console.log('Got offer. Sending answer to peer.');
    peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {},
                                  logError);
    peerConn.createAnswer(onLocalSessionCreated, logError);

  } else if (message.type === 'answer') {
    console.log('Got answer.');
    peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {},
                                  logError);

  } else if (message.type === 'candidate') {
    peerConn.addIceCandidate(new RTCIceCandidate({
      candidate: message.candidate,
      sdpMLineIndex: message.label,
      sdpMid: message.id
    }));
    
  }
}

function createPeerConnection(isInitiator, config) {
  console.log('Creating Peer connection as initiator?', isInitiator, 'config:',
              config);
  peerConn = new RTCPeerConnection(config);

// send any ice candidates to the other peer
peerConn.onicecandidate = function(event) {
  console.log('icecandidate event:', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
};

if (isInitiator) {
  console.log('Creating Data Channel');
  dataChannel = peerConn.createDataChannel('midi-data');
  onDataChannelCreated(dataChannel);

  console.log('Creating an offer');
  peerConn.createOffer().then(function(offer) {
    return peerConn.setLocalDescription(offer);
  })
  .then(() => {
    console.log('sending local desc:', peerConn.localDescription);
    sendMessage(peerConn.localDescription);
  })
  .catch(logError);

} else {
  peerConn.ondatachannel = function(event) {
    console.log('ondatachannel:', event.channel);
    dataChannel = event.channel;
    onDataChannelCreated(dataChannel);
  };
}
}

function onLocalSessionCreated(desc) {
  console.log('local session created:', desc);
  peerConn.setLocalDescription(desc).then(function() {
    console.log('sending local desc:', peerConn.localDescription);
    sendMessage(peerConn.localDescription);
  }).catch(logError);
}

var ping_time = 0;
function sendPing() {
    dataChannel.send('ping');
    ping_time = Date.now();
}

function onDataChannelCreated(channel) {
    console.log('onDataChannelCreated:', channel);

    channel.onopen = function() {
        console.log('CHANNEL opened!!!');
        sendPing();
        var intervalID = window.setInterval(sendPing, 1000);
        sendBtn.disabled = false;
    };

    channel.onclose = function () {
        console.log('Channel closed.');
        sendBtn.disabled = true;
    }

    channel.onmessage = function onmessage(event) {
        if (typeof event.data === 'string') {
            if (event.data == "ping") {
                dataChannel.send("pong");
                return;
            }
            if (event.data == "pong") {
                document.getElementById("ping").innerHTML = Date.now() - ping_time;
                return;
            }
            console.log(event.data, Date.now());
            // split string, play tone
            let midi_data = event.data.split('-');
            if (midi_data.length == 3) {
                // looks like midi data to me, lets just play it
                handleMidiData(parseInt(midi_data[0]), parseInt(midi_data[1]), parseInt(midi_data[2]));
            }
            return;
        }
    };
}

function handleMidiData(command, byte1, byte2) {
	if (command == 144 || command == 128) {
		playNote(THEM, command, byte1, byte2);
	} else if (command == 176 && byte1 == 64) {
		if (byte2 == 0) {
			// pedal off received from server
			pedalOff(THEM);
		} else {
			// pedal on received from server
			pedalOn(THEM);
		}
	}
}

/****************************************************************************
* Aux functions, mostly UI-related
****************************************************************************/

function sendTestMessage() {
    if (!dataChannel) {
        logError('Connection has not been initiated. ' +
            'Get two peers in the same room first');
        return;
    } else if (dataChannel.readyState === 'closed') {
        logError('Connection was lost. Peer closed the connection.');
        return;
    }
    dataChannel.send("Test message");
    sendPing();
}

/*
function randomToken() {
  return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(8);
}
*/

function logError(err) {
  if (!err) return;
  if (typeof err === 'string') {
    console.warn(err);
  } else {
    console.warn(err.toString(), err);
  }
}

function playNote(who, command, note, velocity) {
    //console.log("playing " + command + '-' + note + '-' + velocity);
    switch (command) {
        case 144: // keyDown
            if (velocity > 0) {
                keyDown(who, note, velocity);
            } else {
                keyUp(who, note);
            }
            break;
        case 128: // keyUp
            keyUp(who, note);
            break;
    }
}

function setMySampler() {
    let url = document.getElementById("mysamplerurl").value;
    my_sampler = new Tone.Sampler({
        urls: {
            C3: "C3.wav",
            C4: "C4.wav",
            C5: "C5.wav",
        },
        baseUrl: url,
    }).toDestination();
    console.log("Setting my sample to " + url);
}

function setTheirSampler() {
    let url = document.getElementById("theirsamplerurl").value;
    their_sampler = new Tone.Sampler({
        urls: {
            C3: "C3.wav",
            C4: "C4.wav",
            C5: "C5.wav",
        },
        baseUrl: url,
    }).toDestination();
    console.log("Setting their sample to " + url);
}

Tone.context.latencyHint = "fastest";
var my_sampler = new Tone.Sampler({
	urls: {
		A1: "A1.mp3",
		A2: "A2.mp3",
		A3: "A3.mp3",
		A4: "A4.mp3",
		A5: "A5.mp3",
		A6: "A6.mp3",
		A7: "A7.mp3",
	},
    release: 0.6,
	//baseUrl: "https://tonejs.github.io/audio/casio/",
    baseUrl: "https://tonejs.github.io/audio/salamander/",
}).toDestination();

var their_sampler = new Tone.Sampler({
	urls: {
		A1: "A1.mp3",
		A2: "A2.mp3",
		A3: "A3.mp3",
		A4: "A4.mp3",
		A5: "A5.mp3",
		A6: "A6.mp3",
		A7: "A7.mp3",
	},
    release: 0.6,
	//baseUrl: "https://tonejs.github.io/audio/casio/",
    baseUrl: "https://tonejs.github.io/audio/salamander/",
}).toDestination();


var NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

var my_pedal = false;
var my_pressed_keys = new Set()

var their_pedal = false;
var their_pressed_keys = new Set()

const ME = 0;
const THEM = 1;


function keyDown(who, midiValue, velocity) {
    let note = getNote(midiValue);
    if (who === ME) {
        my_pressed_keys.add(note);
        my_sampler.triggerAttack(note, Tone.context.currentTime, velocity/120)
    } else {
        their_pressed_keys.add(note);
        their_sampler.triggerAttack(note, Tone.context.currentTime, velocity/120)
    }
}

function keyUp(who, midiValue) {
    let note = getNote(midiValue);
    if (who === ME) {
        my_pressed_keys.delete(note)
        if (!my_pedal) {
            my_sampler.triggerRelease(note, Tone.context.currentTime)
        }
    } else {
        their_pressed_keys.delete(note)
        if (!their_pedal) {
            their_sampler.triggerRelease(note, Tone.context.currentTime)
        }
    }
}

function getNote(midiValue) {
    let noteLetter = NOTES[midiValue%12];
    let octave = Math.floor(midiValue/12)-1;
    return noteLetter + octave;
}

        if (navigator.requestMIDIAccess) {
                console.log('This browser supports WebMIDI!');
        } else {
                console.log('WebMIDI is not supported in this browser.');
        }


navigator.requestMIDIAccess()
    .then(onMIDISuccess, onMIDIFailure);


function onMIDIFailure() {
        console.log('Could not access your MIDI devices.');
}

function onMIDISuccess(midiAccess) {
        console.log(midiAccess);

        var inputs = midiAccess.inputs;
        var outputs = midiAccess.outputs;
        for (var input of midiAccess.inputs.values()) {
                    input.onmidimessage = getMIDIMessage;
                }
}

function getMIDIMessage(message) {
    //console.log('midi input detected');
    var command = message.data[0];
    var byte1 = message.data[1];
    var byte2 = (message.data.length > 2) ? message.data[2] : 0; // a velocity value might not be included with a noteOff command

    if (command == 144 || command == 128) {
        let midiInfo = command + '-' + byte1 + '-' + byte2;
        console.log(midiInfo, Date.now());
        if (dataChannel) {
            dataChannel.send(midiInfo);
        }
        playNote(ME, command, byte1, byte2)
    }
    if (command == 176 && message.data[1] == 64) {
        // 0 off, 127 on
        let midiInfo = command + '-' + byte1 + '-' + byte2;
        if (dataChannel) {
            dataChannel.send(midiInfo);
        }
        if (byte2 == 0) {
            pedalOff(ME);
        } else {
            pedalOn(ME);
        }
    }
}

function pedalOff(who) {
    if (who === ME) {
        console.log("my pedal off");
        my_pedal = false;
        let release_keys = getAllKeysWhichArentPressed(who);
        my_sampler.triggerRelease(release_keys, Tone.context.currentTime)
    } else {
        console.log("their pedal off");
        their_pedal = false;
        let release_keys = getAllKeysWhichArentPressed(who);
        their_sampler.triggerRelease(release_keys, Tone.context.currentTime)
    }
}

function pedalOn(who) {
    if (who === ME) {
        console.log("my pedal on");
        my_pedal = true;
    } else {
        console.log("their pedal on");
        their_pedal = true;
    }
}

var ALL_KEYS = []
// A1 to C8
for (let i = 21; i < 108; i++) {
    ALL_KEYS.push(getNote(i));
}

function getAllKeysWhichArentPressed(who) {
    if (who === ME) {
        let toReturn = [];
        for (let i = 0; i < ALL_KEYS.length; i++) {
            if (!my_pressed_keys.has(ALL_KEYS[i])) {
                toReturn.push(ALL_KEYS[i]);
            }
        }
        return toReturn;
    } else {
        let toReturn = [];
        for (let i = 0; i < ALL_KEYS.length; i++) {
            if (!their_pressed_keys.has(ALL_KEYS[i])) {
                toReturn.push(ALL_KEYS[i]);
            }
        }
        return toReturn;
    }
}


