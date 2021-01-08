# Fourhands, the p2p piano

Fourhands uses WebRTC to establish p2p connetions for minimal latency 2-person
jamming using MIDI keyboards.

For seamless collaboration on Fourhands, one-way time of 20 ms or less is
ideal. Typically this can be acheived on wired connections for fairly nearby
players (within 35 miles / 50 km).

Try it here: [create a room and share the link to invite another
player](https://fourhands.jminjie.com).

## Prior art
Online jamming has been acheived already, but often not in an accessible and
unstructured way.

- [Jacktrip](https://news.stanford.edu/2020/09/18/jacktrip-software-allows-musicians-sync-performances-online/)
  allows fairly nearby players to jam in real time, but requires a local
  machine with a static IP (an AWS instance will not work, since the audio
  cable must be plugged in to the machine).
- A few different apps including
  [Endless](https://www.theverge.com/2020/3/31/21201913/endlesss-app-music-remotely-jam-out-loops-real-time),
  [NinJam](https://www.cockos.com/ninjam/), and [Jammr](https://jammr.net/)
  allow collaborative looping, in which your playing is shared n measures after
  you play it.
- [Jamlink](https://musicplayers.com/2011/11/musicianlink-jamlink/) shares
  audio for remote jamming but requires custom hardware.
- My own [collaborative piano](https://piano.jminjie.com) allows multiple
  participants to share a piano (like Google Docs for piano). The latency is
  too high to jam, but this does work for sharing ideas when songwriting
  remotely.
- See an [overview of other options
  here](https://acousticguitar.com/virtual-jamming-the-latest-tools-for-playing-together-in-real-time/).

Comparatively, Fourhands is a simple in-browser solution for which all you need
is a MIDI keyboard and an optionally wired internet. Because only MIDI data is
shared, it is limited to instruments which can output MIDI.

## Development
For self hosting, deploy with `node index.js`. This will serve the files needed
for the page (index.html and js/) and also start the NodeJs server (index.js).
(You may have to use sudo, since index.js by default is serving files through
https, since MIDI access is only allowed on secure connections).

If you don't have an SSL cert you can comment out the https server and
uncomment the http server in index.js. But note that a secure connection is
required for MIDI access (localhost is secure by default).

Client should be available at localhost:30001.

## Browser support
Chrome and Edge work. Firefox does not work as there is [no support for
MIDI.](https://developer.mozilla.org/en-US/docs/Web/API/MIDIAccess). Other
browsers are not tested, but should work if they support MIDI, Tone.js, web
sockets, and WebRTC.

## Demo video
I'm going to try to record a short demo video some time in the next few days to
show how seamless the jamming experience is. For now feel free to try it for
yourself.
