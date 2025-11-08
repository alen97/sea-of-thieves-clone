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
  const initialX = resolveInitialPosition("x");
  const initialY = resolveInitialPosition("y");

  players[socket.id] = {
    playerId: socket.id,
    ship: {
      x: initialX,
      y: initialY,
      rotation: 0,
      velocityX: 0,
      velocityY: 0,
      health: 100,
      damages: [] // Array de roturas: {x, y, id}
    },
    player: {
      x: 0, // Posición relativa al barco
      y: 0,
      isControllingShip: false
    }
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
    if (players[socket.id] && movementData && movementData.ship && movementData.player) {
      players[socket.id].ship.x = movementData.ship.x;
      players[socket.id].ship.y = movementData.ship.y;
      players[socket.id].ship.rotation = movementData.ship.rotation;
      players[socket.id].ship.velocityX = movementData.ship.velocityX || 0;
      players[socket.id].ship.velocityY = movementData.ship.velocityY || 0;

      players[socket.id].player.x = movementData.player.x;
      players[socket.id].player.y = movementData.player.y;
      players[socket.id].player.isControllingShip = movementData.player.isControllingShip;

      // emit a message to all players about the player that moved
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  // CREATE BULLET
  socket.on('createBullet', function (creationData) {
    // update all other players of the new bullet
    console.log("creationData (server): ", creationData)

    bullets.push({ id: bullets.length })
    io.emit('newBullet', creationData);
  });

  // when ship takes damage
  socket.on('shipDamaged', function (damageData) {
    if (players[socket.id]) {
      // Agregar nueva rotura al array de daños
      players[socket.id].ship.damages.push({
        x: damageData.x,
        y: damageData.y,
        id: damageData.id
      });

      // Emitir el daño a todos los jugadores
      io.emit('shipTookDamage', {
        playerId: socket.id,
        damage: damageData,
        health: players[socket.id].ship.health
      });
    }
  });

  // when ship health updates
  socket.on('shipHealthUpdate', function (healthData) {
    if (players[socket.id]) {
      players[socket.id].ship.health = healthData.health;
      socket.broadcast.emit('shipHealthChanged', {
        playerId: socket.id,
        health: healthData.health
      });
    }
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
