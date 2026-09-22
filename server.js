const WebSocket = require('ws');

const PORT = 3000;

const wss = new WebSocket.Server({
    port: PORT
});

const players = new Set();

function broadcastPlayerCount() {
    const count = players.size;

    const message = JSON.stringify({
        type: 'player-count',
        count: count
    });

    for (const player of players) {
        if (player.readyState === WebSocket.OPEN) {
            player.send(message);
        }
    }

    console.log(
        `[Caption Chaos] Active players: ${count}`
    );
}

wss.on('connection', (socket) => {

    players.add(socket);

    console.log(
        '[Caption Chaos] Player connected.'
    );

    broadcastPlayerCount();

    socket.on('close', () => {

        players.delete(socket);

        console.log(
            '[Caption Chaos] Player disconnected.'
        );

        broadcastPlayerCount();
    });

    socket.on('error', () => {

        players.delete(socket);

        broadcastPlayerCount();
    });

});

console.log(
    `[Caption Chaos] Multiplayer server running on ws://localhost:${PORT}`
);