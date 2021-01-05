
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

var room = window.location.hash.substring(1);
if (!room) {
  room = window.location.hash = randomToken();
}

/****************************************************************************
* Signaling server
****************************************************************************/

// Connect to the signaling server
var socket = io.connect();

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
  //console.log('Client received message:', message);
  signalingMessageCallback(message);
});

// Joining a room.
socket.emit('create or join', room);

// Leaving rooms and disconnecting from peers.
socket.on('disconnect', function(reason) {
    console.log(`Disconnected: ${reason}.`);
    sendBtn.disabled = true;
    document.getElementById("peer-status").innerHTML = "Lost peer connection.";
    document.getElementById("peer-status").style.color = "#000";
    document.getElementById("ping").innerHTML = "";
    document.getElementById("ping2").innerHTML = "";
});

socket.on('bye', function(room) {
    console.log(`Peer leaving room ${room}.`);
    sendBtn.disabled = true;
    document.getElementById("peer-status").innerHTML = "Lost peer connection.";
    document.getElementById("peer-status").style.color = "#000";
    document.getElementById("ping").innerHTML = "";
    document.getElementById("ping2").innerHTML = "";
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
function sendMessageToServer(message) {
  //console.log('Client sending message to server:', message, ' room:', room);
  socket.emit('message', { m: message, r: room })
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
        //console.log('icecandidate event:', event);
        if (event.candidate) {
            sendMessageToServer({
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
        peerConn.createOffer()
            .then(function(offer) {
                return peerConn.setLocalDescription(offer);
            })
            .then(() => {
                console.log('sending local desc:', peerConn.localDescription);
                sendMessageToServer(peerConn.localDescription);
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
        sendMessageToServer(peerConn.localDescription);
    }).catch(logError);
}

function peerConnected() {
    return dataChannel && peerConn.connectionState == "connected";
}

var pingTime = 0;

function sendPing() {
    if (peerConnected()) {
        dataChannel.send('ping');
        pingTime = Date.now();
    } else {
    }
}

function onDataChannelCreated(channel) {
    console.log('onDataChannelCreated:', channel);

    channel.onopen = function() {
        console.log('CHANNEL opened!!!');
        document.getElementById("peer-status").innerHTML = "Peer connected.";
        document.getElementById("peer-status").style.color = "green";
        sendPing();
        window.setInterval(sendPing, 1000);
        sendBtn.disabled = false;
    };

    channel.onclose = function () {
        console.log('Channel closed.');
        sendBtn.disabled = true;
        document.getElementById("peer-status").innerHTML = "Lost peer connection.";
        document.getElementById("peer-status").style.color = "#000";
        document.getElementById("ping").innerHTML = "";
        document.getElementById("ping2").innerHTML = "";
    }

    channel.onmessage = function onmessage(event) {
        if (typeof event.data === 'string') {
            if (event.data == "ping") {
                dataChannel.send("pong");
                return;
            }
            if (event.data == "pong") {
                let ping = Date.now() - pingTime;
                document.getElementById("ping").innerHTML = ping;
                document.getElementById("ping2").innerHTML = Math.floor(ping/2);
                return;
            }
            if (event.data.substring(0, 9) == "mySampler") {
                let samplerData = event.data.split(' ');
                changeTheirSampler(samplerData[1], samplerData[2], samplerData[3], samplerData[4]);
                console.log(event.data);
                return;
            }
            if (event.data.substring(0, 12) == "theirSampler") {
                let samplerData = event.data.split(' ');
                changeMySampler(samplerData[1], samplerData[2], samplerData[3], samplerData[4]);
                console.log(event.data);
                return;
            }
            console.log(event.data, Date.now());
            let midiData = event.data.split('-');
            if (midiData.length == 3) {
                // looks like midi data to me, lets just try to play it
                playTheirMidi(parseInt(midiData[0]), parseInt(midiData[1]), parseInt(midiData[2]));
            }
            return;
        }
    };
}

function playTheirMidi(command, byte1, byte2) {
    playMidi(THEM, command, byte1, byte2);
}

/****************************************************************************
* MIDI things
****************************************************************************/

var NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

// pedal for both samplers
var myPedal = false;
var theirPedal = false;

// currently pressed keys for both samplers (used when releasing pedal)
var myPressedKeys = new Set()
var theirPressedKeys = new Set()

const ME = 0;
const THEM = 1;

// gain for both samplers
var myGain = 1.0;
var theirGain = 1.0;

const recorder = new Tone.Recorder();

Tone.context.latencyHint = "fastest";

if (navigator.requestMIDIAccess) {
    console.log('This browser supports WebMIDI!');
    document.getElementById("browser-status").innerHTML = "Browser supports MIDI";
    document.getElementById("browser-status").style.color = "green";
} else {
    console.log('WebMIDI is not supported in this browser.');
    document.getElementById("browser-status").innerHTML = "No browser support for MIDI. Consider trying Chrome or Edge";
    document.getElementById("browser-status").style.color = "red";
}

try {
    navigator.requestMIDIAccess()
        .then(onMIDISuccess, onMIDIFailure);
} catch (e) {
    console.log(e);
}

var mySampler = new Tone.Sampler({
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
mySampler.connect(recorder);


var theirSampler = new Tone.Sampler({
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

function randomToken() {
  return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(8);
}

function logError(err) {
  if (!err) return;
  if (typeof err === 'string') {
    console.warn(err);
  } else {
    console.warn(err.toString(), err);
  }
}

function playMidi(who, command, byte1, byte2) {
    switch (command) {
        case 144: // keyDown
            if (byte2 > 0) {
                keyDown(who, byte1, byte2);
            } else {
                keyUp(who, byte1);
            }
            break;
        case 128: // keyUp
            keyUp(who, byte1);
            break;
        case 176: // special command
            if (byte1 == 64) { // pedal
                if (byte2 == 0) {
                    pedalOff(who);
                } else {
                    pedalOn(who);
                }
            }
            break;
    }
}

function onSetMySamplerButtonPress() {
    let url = document.getElementById("mysamplerurl").value;
    let ext = document.getElementById("mysamplerext").value;
    let rel = document.getElementById("mysamplerrelease").value;
    let gain = document.getElementById("mygain").value;
    changeMySampler(url, ext, rel, gain);
    if (peerConnected()) {
        dataChannel.send("mySampler " + url + " " + ext + " " + rel + " " + gain);
    }
}

function changeMySampler(url, ext, rel, gain) {
    console.log("changeMySampler");
    mySampler = new Tone.Sampler({
        urls: {
            C3: "C3." + ext,
            C4: "C4." + ext,
            C5: "C5." + ext,
        },
        release: rel,
        baseUrl: url,
    }).toDestination();
    myGain = gain;
    document.getElementById("mysamplerurl").value = url;
    document.getElementById("mysamplerext").value = ext;
    document.getElementById("mysamplerrelease").value = rel;
    document.getElementById("mygain").value = gain;
}

function onSetTheirSamplerButtonPress() {
    let url = document.getElementById("theirsamplerurl").value;
    let ext = document.getElementById("theirsamplerext").value;
    let rel = document.getElementById("theirsamplerrelease").value;
    let gain = document.getElementById("theirgain").value;
    changeTheirSampler(url, ext, rel, gain);
    if (peerConnected()) {
        dataChannel.send("theirSampler " + url + " " + ext + " " + rel + " " + gain);
    }
}

function changeTheirSampler(url, ext, rel, gain) {
    console.log("changeTheirSampler");
    theirSampler = new Tone.Sampler({
        urls: {
            C3: "C3." + ext,
            C4: "C4." + ext,
            C5: "C5." + ext,
        },
        baseUrl: url,
        release: rel,
    }).toDestination();
    theirGain = gain;
    document.getElementById("theirsamplerurl").value = url;
    document.getElementById("theirsamplerext").value = ext;
    document.getElementById("theirsamplerrelease").value = rel;
    document.getElementById("theirgain").value = gain;
}


function keyDown(who, midiValue, velocity) {
    let note = getNote(midiValue);
    if (who === ME) {
        myPressedKeys.add(note);
        mySampler.triggerAttack(note, Tone.context.currentTime, velocity*myGain/120)
    } else {
        theirPressedKeys.add(note);
        theirSampler.triggerAttack(note, Tone.context.currentTime, velocity*theirGain/120)
    }
}

function keyUp(who, midiValue) {
    let note = getNote(midiValue);
    if (who === ME) {
        myPressedKeys.delete(note)
        if (!myPedal) {
            mySampler.triggerRelease(note, Tone.context.currentTime)
        }
    } else {
        theirPressedKeys.delete(note)
        if (!theirPedal) {
            theirSampler.triggerRelease(note, Tone.context.currentTime)
        }
    }
}

function getNote(midiValue) {
    let noteLetter = NOTES[midiValue%12];
    let octave = Math.floor(midiValue/12)-1;
    return noteLetter + octave;
}

function onMIDIFailure() {
        console.log('Could not access your MIDI devices.');
}

function onMIDISuccess(midiAccess) {
    console.log(midiAccess);

    var inputs = midiAccess.inputs;
    var outputs = midiAccess.outputs;
    var deviceInfoMessage = "List of devices: [";
    for (var input of midiAccess.inputs.values()) {
        deviceInfoMessage += input.name + ", ";
        input.onmidimessage = onMidiMessage;
    }
    deviceInfoMessage += "]";
    if (inputs.size > 0) {
        document.getElementById("midi-status").innerHTML = deviceInfoMessage;
        document.getElementById("midi-status").style.color = "green";
    }
}

document.addEventListener('keydown', function(event) {
    if (event.repeat == true) {
        return;
    }
    if (event.srcElement.localName == "input") {
        return;
    }
    let midiKeyCode = -1;
    switch (event.code) {
        case "KeyA":
            midiKeyCode = 60;
            break;
        case "KeyW":
            midiKeyCode = 61;
            break;
        case "KeyS":
            midiKeyCode = 62;
            break;
        case "KeyE":
            midiKeyCode = 63;
            break;
        case "KeyD":
            midiKeyCode = 64;
            break;
        case "KeyF":
            midiKeyCode = 65;
            break;
        case "KeyT":
            midiKeyCode = 66;
            break;
        case "KeyG":
            midiKeyCode = 67;
            break;
        case "KeyY":
            midiKeyCode = 68;
            break;
        case "KeyH":
            midiKeyCode = 69;
            break;
        case "KeyU":
            midiKeyCode = 70;
            break;
        case "KeyJ":
            midiKeyCode = 71;
            break;
        case "KeyK":
            midiKeyCode = 72;
            break;
    }
    if (midiKeyCode != -1) {
        keyDown(ME, midiKeyCode, 80);
        if (peerConnected()) {
            let midiInfo = '144-' + midiKeyCode + '-80';
            dataChannel.send(midiInfo);
        }
    }
});

document.addEventListener('keyup', function(event) {
    if (event.repeat == true) {
        return;
    }
    if (event.srcElement.localName == "input") {
        return;
    }
    let midiKeyCode = -1;
    switch (event.code) {
        case "KeyA":
            midiKeyCode = 60;
            break;
        case "KeyW":
            midiKeyCode = 61;
            break;
        case "KeyS":
            midiKeyCode = 62;
            break;
        case "KeyE":
            midiKeyCode = 63;
            break;
        case "KeyD":
            midiKeyCode = 64;
            break;
        case "KeyF":
            midiKeyCode = 65;
            break;
        case "KeyT":
            midiKeyCode = 66;
            break;
        case "KeyG":
            midiKeyCode = 67;
            break;
        case "KeyY":
            midiKeyCode = 68;
            break;
        case "KeyH":
            midiKeyCode = 69;
            break;
        case "KeyU":
            midiKeyCode = 70;
            break;
        case "KeyJ":
            midiKeyCode = 71;
            break;
        case "KeyK":
            midiKeyCode = 72;
            break;
    }
    if (midiKeyCode != -1) {
        keyUp(ME, midiKeyCode, 80);
        if (peerConnected()) {
            let midiInfo = '128-' + midiKeyCode + '-80';
            dataChannel.send(midiInfo);
        }
    }
});


function onMidiMessage(message) {
    var command = message.data[0];
    var byte1 = message.data[1];
    // a velocity value might not be included with a noteOff command
    var byte2 = (message.data.length > 2) ? message.data[2] : 0;

    if (peerConnected()) {
        let midiInfo = command + '-' + byte1 + '-' + byte2;
        dataChannel.send(midiInfo);
    }
    playMidi(ME, command, byte1, byte2)
}

function pedalOff(who) {
    if (who === ME) {
        console.log("my pedal off");
        myPedal = false;
        let releaseKeys = getAllKeysWhichArentPressed(who);
        mySampler.triggerRelease(releaseKeys, Tone.context.currentTime)
    } else {
        console.log("their pedal off");
        theirPedal = false;
        let releaseKeys = getAllKeysWhichArentPressed(who);
        theirSampler.triggerRelease(releaseKeys, Tone.context.currentTime)
    }
}

function pedalOn(who) {
    if (who === ME) {
        console.log("my pedal on");
        myPedal = true;
    } else {
        console.log("their pedal on");
        theirPedal = true;
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
            if (!myPressedKeys.has(ALL_KEYS[i])) {
                toReturn.push(ALL_KEYS[i]);
            }
        }
        return toReturn;
    } else {
        let toReturn = [];
        for (let i = 0; i < ALL_KEYS.length; i++) {
            if (!theirPressedKeys.has(ALL_KEYS[i])) {
                toReturn.push(ALL_KEYS[i]);
            }
        }
        return toReturn;
    }
}

function startRecording() {
    recorder.start();
}

function stopRecording() {
	// the recorded audio is returned as a blob
	const recording = recorder.stop().then(function(blob) {
        console.log("got blob");
        console.log(blob);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.download = "recording.webm";
            anchor.href = url;
            anchor.click();

    });
}
