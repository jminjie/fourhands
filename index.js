'use strict';

var os = require('os');
var nodeStatic = require('node-static');
var socketIO = require('socket.io');

var fileServer = new nodeStatic.Server('./public');

const DEBUG = (process.argv[2] == "debug") ? true : false;

if (DEBUG) {
    console.log("Running in debug mode. Note that MIDI is not available without HTTPS");
    console.log("Up on localhost:30001");
    const http = require('http');
    var app = http.createServer(function(req, res) {
        log(req.url);
        fileServer.serve(req, res);
    }).listen(30001);
} else {
    const Https = require('https');
    const Fs = require('fs');
    var secureApp = Https.createServer({
        key: Fs.readFileSync('/etc/letsencrypt/live/jminjie.com/privkey.pem'),
        cert: Fs.readFileSync('/etc/letsencrypt/live/jminjie.com/cert.pem'),
        ca: Fs.readFileSync('/etc/letsencrypt/live/jminjie.com/chain.pem')
    }, function(req, res) {
        fileServer.serve(req, res);
    }).listen(30001);
}

function log(m) {
    console.log(m);
}

var io = socketIO.listen(DEBUG ? app : secureApp);
io.sockets.on('connection', function(socket) {

    socket.on('message', function({ m, r }) {
        log('Client said: ', m);
        socket.broadcast.to(r).emit('message', m);
    });


    socket.on('create or join', function(room) {
        log('Received request to create or join room ' + room);

        var clientsInRoom = io.sockets.adapter.rooms[room];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        log('Room ' + room + ' currently has ' + numClients + ' client(s)');

        if (numClients === 0) {
            socket.join(room);
            log('Client ID ' + socket.id + ' created room ' + room);
            socket.emit('created', room, socket.id);
        } else if (numClients === 1) {
            log('Client ID ' + socket.id + ' joined room ' + room);
            io.sockets.in(room).emit('join', room);
            socket.join(room);
            socket.emit('joined', room, socket.id);
            io.sockets.in(room).emit('ready', room);
            //socket.broadcast.emit('ready', room);
        } else { // max two clients
            socket.emit('full', room);
        }
    });

    socket.on('ipaddr', function() {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(function(details) {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                    socket.emit('ipaddr', details.address);
                }
            });
        }
    });

    socket.on('bye', function(room) {
        console.log(`Peer said bye on room ${room}.`);
        io.sockets.in(room).emit('bye', room);
    });
});
