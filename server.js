var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

var players = {};
var bullets = [];

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
  console.log('a user connected: ', socket.id);
  // create a new player and add it to our players object
  players[socket.id] = {
    rotation: 0,
    x: resolveInitialPosition("x"),
    y: resolveInitialPosition("y"),
    playerId: socket.id,
    sprite: 'ship'

  };

  // send the players object to the new player
  socket.emit('currentPlayers', players);

  // update all other players of the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // when a player disconnects, remove them from our players object
  socket.on('disconnect', function () {
    console.log('user disconnected: ', socket.id);
    delete players[socket.id];
    // emit a message to all players to remove this player
    io.emit('disconnect', socket.id);
  });

  // when a player moves, update the player data
  socket.on('playerMovement', function (movementData) {
    players[socket.id].x = movementData.x;
    players[socket.id].y = movementData.y;
    players[socket.id].rotation = movementData.rotation;
    players[socket.id].sprite = movementData.sprite;
    // emit a message to all players about the player that moved
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });

  // CREATE BULLET
  socket.on('createBullet', function (creationData) {
    // update all other players of the new bullet
    console.log("creationData (server): ", creationData)

    bullets.push({ id: bullets.length })
    io.emit('newBullet', creationData);
  });

  // when a player dies, update global data
  socket.on('playerDied', function (deathData) {

    // console.log("PLAYER DIED")
    players[socket.id].sprite = deathData.sprite;
    players[socket.id].x = deathData.x;
    players[socket.id].y = deathData.y;
    players[socket.id].rotation = deathData.rotation;
    players[socket.id].isPlayerDead = true;

    players[deathData.killerId].kills++;

    // emit a message to all players about the player that moved
    // socket.broadcast.emit('playerMoved', players[socket.id]);
    socket.broadcast.emit('playerIsDead', players[socket.id], deathData);
  });

});

function resolveInitialPosition(axis) {

  let result = Math.floor(Math.random() * 4) // 0 al 3 (4 bordes del mapa)
  console.log("RANDOM RESULT: ", result)

  if (result === 0) {
    if (axis === "x") {
      return Math.floor(Math.random() * 150) + 25
    } else { // axis === "y"
      return Math.floor(Math.random() * 150) + 25
    }
  }

  if (result === 1) {
    if (axis === "x") {
      return 1600 - Math.floor(Math.random() * 150) - 25
    } else { // axis === "y"
      return Math.floor(Math.random() * 150) + 25
    }
  }

  if (result === 2) {
    if (axis === "x") {
      return Math.floor(Math.random() * 150) + 25
    } else { // axis === "y"
      return 1600 - Math.floor(Math.random() * 150) - 25
    }
  }

  if (result === 3) {
    if (axis === "x") {
      return 1600 - Math.floor(Math.random() * 150) - 25
    } else { // axis === "y"
      return 1600 - Math.floor(Math.random() * 150) - 25
    }
  }

}

server.listen(80, function () {
  console.log(`Listening on ${server.address().port}`);
});
