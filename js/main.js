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
    document.getElementById("peer-status").innerHTML = "Lost connection from partner.";
    document.getElementById("peer-status").style.color = "#000";
    document.getElementById("ping").innerHTML = "";
    document.getElementById("ping2").innerHTML = "";
});

socket.on('bye', function(room) {
    console.log(`Peer leaving room ${room}.`);
    sendBtn.disabled = true;
    document.getElementById("peer-status").innerHTML = "Lost connection from partner.";
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

window.addEventListener('load', function() {
    if (document.cookie.indexOf("cookie_soundon=") < 0) {
        document.querySelector('.sound-overlay').classList.remove('d-none');
    }
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
        document.getElementById("peer-status").innerHTML = "Partner connected.";
        document.getElementById("peer-status").style.color = "green";
        sendPing();
        window.setInterval(sendPing, 1000);
        sendBtn.disabled = false;
        // when connecting, send sampler info in case player changed already
        onSetMySamplerButtonPress();
        onSetLoopSamplerButtonPress();
    };

    channel.onclose = function () {
        console.log('Channel closed.');
        sendBtn.disabled = true;
        document.getElementById("peer-status").innerHTML = "Lost connection from partner.";
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
                changeTheirSampler(samplerData[1], samplerData[2], samplerData[3], samplerData[4], samplerData[5]);
                console.log(event.data);
                return;
            }
            // only you can set your own loop, so we don't need to listen for myLoopSampler
            if (event.data.substring(0, 16) == "theirLoopSampler") {
                let samplerData = event.data.split(' ');
                changeTheirLoopSampler(samplerData[1], samplerData[2], samplerData[3], samplerData[4], samplerData[5]);
                console.log(event.data);
                return;
            }
            if (event.data.substring(0, 12) == "theirSampler") {
                let samplerData = event.data.split(' ');
                changeMySampler(samplerData[1], samplerData[2], samplerData[3], samplerData[4], samplerData[5]);
                console.log(event.data);
                return;
            }
            console.log(event.data, Date.now());
            let midiData = event.data.split('-');
            if (midiData.length == 3) {
                // looks like midi data to me, lets just try to play it
                playMidi(THEM, parseInt(midiData[0]), parseInt(midiData[1]), parseInt(midiData[2]));
            }
            if (midiData.length == 4 && midiData[0] == "LOOP") {
                // loop midi data
                playMidi(THEIR_LOOP, parseInt(midiData[1]), parseInt(midiData[2]), parseInt(midiData[3]));
            }
            return;
        }
    };
}

function playTheirMidi(command, byte1, byte2) {
}

/****************************************************************************
* MIDI things
****************************************************************************/

var NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

// pedal for both samplers
var myPedal = false;
var theirPedal = false;
var myLoopPedal = false;
var theirLoopPedal = false;

// currently pressed keys for both samplers (used when releasing pedal)
var myPressedKeys = new Set()
var theirPressedKeys = new Set()
var myLoopPressedKeys = new Set()
var theirLoopPressedKeys = new Set()

const ME = 0;
const THEM = 1;
const MY_LOOP = 2;
const THEIR_LOOP = 3;

// gain for both samplers
var myGain = 1.0;
var theirGain = 1.0;
var myLoopGain = 1.0;
var theirLoopGain = 1.0;

Tone.context.latencyHint = "fastest";

// octave for computer keyboard entry
var octave = 0;

// local loop data
document.getElementById("startLoopButton").disabled = false;
document.getElementById("stopLoopButton").disabled = true;
document.getElementById("playPauseLoopButton").disabled = true;
var loopStartTime;
var loopLength;
var recording = false;
var loopData = [];
var playingLoop = false;
var loopId;

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

const default_reverb = new Tone.Reverb(1.5).toDestination();

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
    baseUrl: "https://tonejs.github.io/audio/salamander/",
}).connect(default_reverb).toDestination();

var myLoopSampler = new Tone.Sampler({
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
    baseUrl: "https://tonejs.github.io/audio/salamander/",
}).connect(default_reverb).toDestination();

var theirLoopSampler = new Tone.Sampler({
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
    baseUrl: "https://tonejs.github.io/audio/salamander/",
}).connect(default_reverb).toDestination();

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
    baseUrl: "https://tonejs.github.io/audio/salamander/",
}).connect(default_reverb).toDestination();


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
    if (recording && who == ME) {
        addToLoop(command, byte1, byte2);
    }
}

function onSetMySamplerButtonPress() {
    //let url = document.getElementById("mysamplerurl").value;

    var dropdown = document.getElementById("dropdownsampler");
    var samplerValue = dropdown.options[dropdown.selectedIndex].value;
    var url = "https://jminjie.github.io/samples/" + samplerValue + '/';

    let rel = document.getElementById("mysamplerrelease").value;
    let gain = document.getElementById("mygain").value;
    let decay = document.getElementById("mydecay").value;
    changeMySampler(url, rel, gain, decay, samplerValue);
    if (peerConnected()) {
        dataChannel.send("mySampler " + url + " " + rel + " " + gain + " " + decay + " " + samplerValue);
    }
}

function onSetLoopSamplerButtonPress() {
    var dropdown = document.getElementById("loopdropdownsampler");
    var samplerValue = dropdown.options[dropdown.selectedIndex].value;
    var url = "https://jminjie.github.io/samples/" + samplerValue + '/';

    let rel = document.getElementById("loopsamplerrelease").value;
    let gain = document.getElementById("loopgain").value;
    let decay = document.getElementById("loopdecay").value;
    changeLoopSampler(url, rel, gain, decay, samplerValue);
    if (peerConnected()) {
        dataChannel.send("theirLoopSampler " + url + " " + rel + " " + gain + " " + decay + " " + samplerValue);
    }
}

function changeMySampler(url, rel, gain, decay, samplerValue) {
    console.log("changeMySampler");
    fetch(url + 'config.json')
        .then(response => response.json())
        .then(function (mapping) {
            mySampler = new Tone.Sampler({
                urls: mapping,
                release: rel,
                baseUrl: url,
            }).toDestination();
            if (parseFloat(decay) > 0) {
                let reverb = new Tone.Reverb(parseFloat(decay)).toDestination();
                mySampler.connect(reverb);
            }
            myGain = parseFloat(gain);
            sound = Sound.from( mySampler, mySampler.context ).analyze(256);
            //document.getElementById("mysamplerurl").value = url;
            document.getElementById("dropdownsampler").value = samplerValue;
            document.getElementById("mysamplerrelease").value = rel;
            document.getElementById("mygain").value = gain;
            document.getElementById("mydecay").value = decay;
        });
}

function changeLoopSampler(url, rel, gain, decay, samplerValue) {
    console.log("changeLoopSampler");
    fetch(url + 'config.json')
        .then(response => response.json())
        .then(function (mapping) {
            myLoopSampler = new Tone.Sampler({
                urls: mapping,
                release: rel,
                baseUrl: url,
            }).toDestination();
            if (parseFloat(decay) > 0) {
                let reverb = new Tone.Reverb(parseFloat(decay)).toDestination();
                myLoopSampler.connect(reverb);
            }
            myLoopGain = parseFloat(gain);
            document.getElementById("loopdropdownsampler").value = samplerValue;
            document.getElementById("loopsamplerrelease").value = rel;
            document.getElementById("loopgain").value = gain;
            document.getElementById("loopdecay").value = decay;
        });
}

function changeTheirLoopSampler(url, rel, gain, decay) {
    console.log("changeTheirLoopSampler");
    fetch(url + 'config.json')
        .then(response => response.json())
        .then(function (mapping) {
            theirLoopSampler = new Tone.Sampler({
                urls: mapping,
                release: rel,
                baseUrl: url,
            }).toDestination();
            if (parseFloat(decay) > 0) {
                let reverb = new Tone.Reverb(parseFloat(decay)).toDestination();
                theirLoopSampler.connect(reverb);
            }
            theirLoopGain = parseFloat(gain);
        });
}

function onSetTheirSamplerButtonPress() {
    var dropdown = document.getElementById("theirdropdownsampler");
    var samplerValue = dropdown.options[dropdown.selectedIndex].value;
    var url = "https://jminjie.github.io/samples/" + samplerValue + '/';

    let rel = document.getElementById("theirsamplerrelease").value;
    let gain = document.getElementById("theirgain").value;
    let decay = document.getElementById("theirdecay").value;
    changeTheirSampler(url, rel, gain, decay, samplerValue);
    if (peerConnected()) {
        dataChannel.send("theirSampler " + url + " " + rel + " " + gain + " " + decay + " " + samplerValue);
    }
}

function changeTheirSampler(url, rel, gain, decay, samplerValue) {
    console.log("changeTheirSampler");
    fetch(url + 'config.json')
        .then(response => response.json())
        .then(function (mapping) {
            let reverb = new Tone.Reverb(parseFloat(decay)).toDestination();
            theirSampler = new Tone.Sampler({
                urls: mapping,
                release: rel,
                baseUrl: url,
            }).toDestination();
            if (parseFloat(decay) > 0) {
                let reverb = new Tone.Reverb(parseFloat(decay)).toDestination();
                theirSampler.connect(reverb);
            }
            theirGain = parseFloat(gain);
            sound2 = Sound.from( theirSampler, theirSampler.context ).analyze(256);
            document.getElementById("theirdropdownsampler").value = samplerValue;
            document.getElementById("theirsamplerrelease").value = rel;
            document.getElementById("theirgain").value = gain;
            document.getElementById("theirdecay").value = decay;
        });
}

function keyDown(who, midiValue, velocity) {
    let note = getNote(midiValue);
    if (who === ME) {
        myPressedKeys.add(note);
        mySampler.triggerAttack(note, Tone.context.currentTime, velocity*myGain/120)
    } else if (who === THEM) {
        theirPressedKeys.add(note);
        theirSampler.triggerAttack(note, Tone.context.currentTime, velocity*theirGain/120)
    } else if (who === MY_LOOP) {
        myLoopPressedKeys.add(note);
        myLoopSampler.triggerAttack(note, Tone.context.currentTime, velocity*myLoopGain/120)
    } else if (who === THEIR_LOOP) {
        theirLoopPressedKeys.add(note);
        theirLoopSampler.triggerAttack(note, Tone.context.currentTime, velocity*theirLoopGain/120)
    }
}

function keyUp(who, midiValue) {
    let note = getNote(midiValue);
    if (who === ME) {
        myPressedKeys.delete(note)
        if (!myPedal) {
            mySampler.triggerRelease(note, Tone.context.currentTime)
        }
    } else if (who === THEM) {
        theirPressedKeys.delete(note)
        if (!theirPedal) {
            theirSampler.triggerRelease(note, Tone.context.currentTime)
        }
    } else if (who === MY_LOOP) {
        myLoopPressedKeys.delete(note)
        if (!myLoopPedal) {
            myLoopSampler.triggerRelease(note, Tone.context.currentTime)
        }
    } else if (who === THEIR_LOOP) {
        theirLoopPressedKeys.delete(note)
        if (!theirLoopPedal) {
            theirLoopSampler.triggerRelease(note, Tone.context.currentTime)
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
        case "KeyZ":
            octave--;
            break;
        case "KeyX":
            octave++;
            break;
    }
    if (midiKeyCode != -1) {
        midiKeyCode += octave*12;
        playMidi(ME, 144, midiKeyCode, 80);
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
        midiKeyCode += octave*12;
        playMidi(ME, 128, midiKeyCode, 0);
        if (peerConnected()) {
            let midiInfo = '128-' + midiKeyCode + '-0';
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

function onLoopMidiMessage(message) {
    var command = message.data[0];
    var byte1 = message.data[1];
    // a velocity value might not be included with a noteOff command
    var byte2 = (message.data.length > 2) ? message.data[2] : 0;

    if (peerConnected()) {
        let midiInfo = command + '-' + byte1 + '-' + byte2;
        dataChannel.send("LOOP-" + midiInfo);
    }
    playMidi(MY_LOOP, command, byte1, byte2)
}

function pedalOff(who) {
    if (who === ME) {
        myPedal = false;
        let releaseKeys = getAllKeysWhichArentPressed(who);
        mySampler.triggerRelease(releaseKeys, Tone.context.currentTime)
    } else if (who === THEM) {
        theirPedal = false;
        let releaseKeys = getAllKeysWhichArentPressed(who);
        theirSampler.triggerRelease(releaseKeys, Tone.context.currentTime)
    } else if (who === MY_LOOP) {
        myLoopPedal = false;
        let releaseKeys = getAllKeysWhichArentPressed(who);
        myLoopSampler.triggerRelease(releaseKeys, Tone.context.currentTime)
    } else if (who === THEIR_LOOP) {
        theirLoopPedal = false;
        let releaseKeys = getAllKeysWhichArentPressed(who);
        theirLoopSampler.triggerRelease(releaseKeys, Tone.context.currentTime)
    }
}

function pedalOn(who) {
    if (who === ME) {
        myPedal = true;
    } else if (who === THEM) {
        theirPedal = true;
    } else if (who === MY_LOOP) {
        myLoopPedal = true;
    } else if (who === THEIR_LOOP) {
        theirLoopPedal = true;
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
    } else if (who === THEM) {
        let toReturn = [];
        for (let i = 0; i < ALL_KEYS.length; i++) {
            if (!theirPressedKeys.has(ALL_KEYS[i])) {
                toReturn.push(ALL_KEYS[i]);
            }
        }
        return toReturn;
    } else if (who === MY_LOOP) {
        let toReturn = [];
        for (let i = 0; i < ALL_KEYS.length; i++) {
            if (!myLoopPressedKeys.has(ALL_KEYS[i])) {
                toReturn.push(ALL_KEYS[i]);
            }
        }
        return toReturn;
    } else if (who === THEIR_LOOP) {
        let toReturn = [];
        for (let i = 0; i < ALL_KEYS.length; i++) {
            if (!theirLoopPressedKeys.has(ALL_KEYS[i])) {
                toReturn.push(ALL_KEYS[i]);
            }
        }
        return toReturn;
    }
}

function addToLoop(command, byte1, byte2) {
    if (loopData.length === 0 && command == 128) {
        // if first note in loop is key up, assume we missed keydown and add it automatically
        loopData.push({
            time: 0,
            command: 144, // keydown
            byte1: byte1,
            byte2: 80, // assume 80 velocity
        });
    }
    loopData.push({
        time: Date.now() - loopStartTime,
        command: command,
        byte1: byte1,
        byte2: byte2,
    });
}

function playPauseLoop() {
    if (recording) {
        finishLoop();
    }
    if (playingLoop == false) {
        playingLoop = true;
        playLoopOnce();
        loopId = setInterval(playLoopOnce, loopLength);
    } else {
        clearInterval(loopId);
        stopPlayingLoop();
        playingLoop = false;
    }
}

loopTimeoutIds = []
function playLoopOnce() {
    for (let note of loopData) {
        noteData = [note.command, note.byte1, note.byte2];
        let message = {
            data: noteData,
        };
        loopTimeoutIds.push(setTimeout(onLoopMidiMessage, note.time, message));
    }
}

function stopPlayingLoop() {
    for (let id of loopTimeoutIds) {
        clearTimeout(id);
    }
}

function beginLoop() {
    loopData = [];
    console.log("begin loop");
    loopStartTime = Date.now();
    recording = true;
    document.getElementById("startLoopButton").disabled = true;
    document.getElementById("stopLoopButton").disabled = false;
    document.getElementById("playPauseLoopButton").disabled = false;
    // automatically set loop sampler things equal to my sampler
    //let url = document.getElementById("mysamplerurl").value;
    var dropdown = document.getElementById("dropdownsampler");
    var samplerValue = dropdown.options[dropdown.selectedIndex].value;
    var url = "https://jminjie.github.io/samples/" + samplerValue + '/';

    let rel = document.getElementById("mysamplerrelease").value;
    let gain = document.getElementById("mygain").value;
    let decay = document.getElementById("mydecay").value;
    changeLoopSampler(url, rel, gain, decay, samplerValue);
    if (peerConnected()) {
        dataChannel.send("theirLoopSampler " + url + " " + rel + " " + gain + " " + decay);
    }
    // if pedal is down at start of loop, add to loop
    if (myPedal) {
        addToLoop(176, 64, 1);
    }
}

function finishLoop() {
    console.log("finish loop");
    recording = false;
    loopLength = Date.now() - loopStartTime;
    document.getElementById("startLoopButton").disabled = false;
    document.getElementById("stopLoopButton").disabled = true;
    document.getElementById("playPauseLoopButton").disabled = false;
}

var paused = false;
function toggleVisual() {
    if (paused) {
        space.resume();
        space2.resume();
        paused = false;
    } else {
        paused = true;
        space.pause();
        space2.pause();
    }
}


/****************************************************************************
* Visualization logic
****************************************************************************/
Pts.namespace( window );
var space = new CanvasSpace("#pts");
space.setup({ bgcolor: "powderblue" });
var form = space.getForm();

var sound = Sound.from( mySampler, mySampler.context ).analyze(256);

space.add({
    animate: (time) => {
        if (mySampler.context.state === 'suspended') { // mostly for safari
            form.fillOnly("#fff").text( [20, 30], "Click anywhere to start" );
        }

        var area = space.size;
        var idx = space.pointer.$divide( area ).floor();
        var rect = [idx.$multiply(area), idx.$multiply(area).add(area)];

        let t1 = sound.timeDomainTo( area, rect[0].$subtract(0, area.y/2) );
        let t2 = t1.map( t => t.$add(0, area.y) ).reverse();
        let freqs = sound.freqDomainTo( [area.x*2, area.y/2], [rect[0].x, 0] ).map( f => [[f.x, rect[0].y+area.y/2-f.y], [f.x, rect[0].y+area.y/2+f.y]] );

        form.fillOnly("powderblue").polygon( t1.concat(t2) );
        form.strokeOnly("white", Math.ceil(area.x/128) ).lines( freqs );
    },
    action: (type, x, y) => {
        if (type === "up") { // for safari
            if (mySampler.context.state === 'suspended') {
                mySampler.context.resume();
            }
        }
    }
});
space.autoResize = false;
space.play();

var space2 = new CanvasSpace("#pts2");
space2.setup({ bgcolor: "#F9E79F" });
var form2 = space2.getForm();

var sound2 = Sound.from( theirSampler, theirSampler.context ).analyze(256);

space2.add({
    animate: (time) => {
        if (theirSampler.context.state === 'suspended') { // mostly for safari
            form2.fillOnly("#fff").text( [20, 30], "Click anywhere to start" );
        }

        var area = space2.size;
        var idx = space2.pointer.$divide( area ).floor();
        var rect = [idx.$multiply(area), idx.$multiply(area).add(area)];

        let t1 = sound2.timeDomainTo( area, rect[0].$subtract(0, area.y/2) );
        let t2 = t1.map( t => t.$add(0, area.y) ).reverse();
        let freqs = sound2.freqDomainTo( [area.x*2, area.y/2], [rect[0].x, 0] ).map( f => [[f.x, rect[0].y+area.y/2-f.y], [f.x, rect[0].y+area.y/2+f.y]] );

        form2.fillOnly("#F9E79F").polygon( t1.concat(t2) );
        form2.strokeOnly("black", Math.ceil(area.x/128) ).lines( freqs );
    },
    action: (type, x, y) => {
        if (type === "up") { // for safari
            if (theirSampler.context.state === 'suspended') {
                theirSampler.context.resume();
            }
        }
    }
});
space2.play();

function acceptSound() {
    document.cookie = "cookie_soundon=true";
    document.querySelector('.sound-overlay').classList.add('d-none');
    Tone.start();
}
