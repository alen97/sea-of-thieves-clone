var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

// Room-based structure: each room has its own players and bullets
var rooms = {};

// Day/Night cycle - Server authoritative time
var gameWorld = {
  cycleLength: 1 * 60 * 1000, // 5 minutes for full day/night cycle
  gameStartTime: Date.now(),
  currentTime: 0, // Will be calculated
  timeRatio: 0.5 // Start at noon (0.5 = 12:00 PM)
};

// Initialize starting time to noon
gameWorld.currentTime = gameWorld.cycleLength * 0.5;

// World configuration
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 3200;

// Helper functions
function getRoomId(roomX, roomY) {
  return `${roomX},${roomY}`;
}

function getOrCreateRoom(roomX, roomY) {
  const roomId = getRoomId(roomX, roomY);
  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: {},
      bullets: []
    };
  }
  return rooms[roomId];
}

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
  console.log('a user connected: ', socket.id);

  // Initialize player in room (0, 0)
  const initialRoomX = 0;
  const initialRoomY = 0;
  const roomId = getRoomId(initialRoomX, initialRoomY);
  const room = getOrCreateRoom(initialRoomX, initialRoomY);

  // Join the socket.io room
  socket.join(roomId);

  // Store room info in socket
  socket.currentRoomX = initialRoomX;
  socket.currentRoomY = initialRoomY;

  const initialX = resolveInitialPosition("x");
  const initialY = resolveInitialPosition("y");

  room.players[socket.id] = {
    playerId: socket.id,
    roomX: initialRoomX,
    roomY: initialRoomY,
    ship: {
      x: initialX,
      y: initialY,
      rotation: 0,
      velocityX: 0,
      velocityY: 0,
      health: 100,
      damages: [],
      cannons: {
        leftAngle: 0,
        rightAngle: 0
      }
    },
    player: {
      x: 0,
      y: 0,
      rotation: Math.PI,
      isControllingShip: false,
      isOnCannon: false,
      cannonSide: null
    }
  };

  // Send only players in the same room to the new player
  socket.emit('currentPlayers', room.players);
  socket.emit('roomChanged', { roomX: initialRoomX, roomY: initialRoomY });

  // Update other players in the same room about the new player
  socket.to(roomId).emit('newPlayer', room.players[socket.id]);

  // when a player disconnects, remove them from their room
  socket.on('disconnect', function () {
    console.log('user disconnected: ', socket.id);
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.players[socket.id]) {
      delete room.players[socket.id];
      // Emit to players in the same room only
      io.to(roomId).emit('disconnect', socket.id);
    }
  });

  // when a player moves, update the player data
  socket.on('playerMovement', function (movementData) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.players[socket.id] && movementData && movementData.ship && movementData.player) {
      room.players[socket.id].ship.x = movementData.ship.x;
      room.players[socket.id].ship.y = movementData.ship.y;
      room.players[socket.id].ship.rotation = movementData.ship.rotation;
      room.players[socket.id].ship.velocityX = movementData.ship.velocityX || 0;
      room.players[socket.id].ship.velocityY = movementData.ship.velocityY || 0;

      // Sincronizar ángulos de los cañones
      if (movementData.ship.cannons) {
        room.players[socket.id].ship.cannons = movementData.ship.cannons;
      }

      room.players[socket.id].player.x = movementData.player.x;
      room.players[socket.id].player.y = movementData.player.y;
      room.players[socket.id].player.rotation = movementData.player.rotation;
      room.players[socket.id].player.isControllingShip = movementData.player.isControllingShip;
      room.players[socket.id].player.velocityX = movementData.player.velocityX || 0;
      room.players[socket.id].player.velocityY = movementData.player.velocityY || 0;

      // Sincronizar estado del cañón
      if (movementData.player.isOnCannon !== undefined) {
        room.players[socket.id].player.isOnCannon = movementData.player.isOnCannon;
      }
      if (movementData.player.cannonSide !== undefined) {
        room.players[socket.id].player.cannonSide = movementData.player.cannonSide;
      }

      // Emit to players in the same room only
      socket.to(roomId).emit('playerMoved', room.players[socket.id]);
    }
  });

  // CREATE BULLET
  socket.on('createBullet', function (creationData) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room) {
      console.log("creationData (server): ", creationData);
      room.bullets.push({ id: room.bullets.length });
      // Emit to all players in the same room
      io.to(roomId).emit('newBullet', creationData);
    }
  });

  // when ship takes damage
  socket.on('shipDamaged', function (damageData) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.players[socket.id]) {
      // Add new damage to the damages array
      room.players[socket.id].ship.damages.push({
        x: damageData.x,
        y: damageData.y,
        id: damageData.id
      });

      // Emit damage to all players in the same room
      io.to(roomId).emit('shipTookDamage', {
        playerId: socket.id,
        damage: damageData,
        health: room.players[socket.id].ship.health
      });
    }
  });

  // when ship health updates
  socket.on('shipHealthUpdate', function (healthData) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.players[socket.id]) {
      room.players[socket.id].ship.health = healthData.health;
      socket.to(roomId).emit('shipHealthChanged', {
        playerId: socket.id,
        health: healthData.health
      });
    }
  });

  // when a player sends a chat message
  socket.on('chatMessage', function (messageData) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);

    // Validar que el mensaje existe y no está vacío
    if (!messageData.message || messageData.message.trim() === '') {
      return;
    }

    // Limitar longitud del mensaje
    const message = messageData.message.trim().substring(0, 50);

    // Broadcast a todos los jugadores en el mismo room (incluyendo el emisor)
    io.to(roomId).emit('playerSentMessage', {
      playerId: socket.id,
      message: message,
      x: messageData.x,
      y: messageData.y,
      timestamp: Date.now()
    });
  });

  // when a player changes room
  socket.on('changeRoom', function (roomData) {
    const oldRoomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const newRoomId = getRoomId(roomData.roomX, roomData.roomY);

    console.log(`Player ${socket.id} changing from room ${oldRoomId} to ${newRoomId}`);

    // Get old room and remove player from it
    const oldRoom = rooms[oldRoomId];
    if (oldRoom && oldRoom.players[socket.id]) {
      const playerData = oldRoom.players[socket.id];
      delete oldRoom.players[socket.id];

      // Notify old room players that this player left
      socket.to(oldRoomId).emit('disconnect', socket.id);

      // Leave old socket.io room
      socket.leave(oldRoomId);

      // Update player's room coordinates
      socket.currentRoomX = roomData.roomX;
      socket.currentRoomY = roomData.roomY;
      playerData.roomX = roomData.roomX;
      playerData.roomY = roomData.roomY;

      // Update player position for the new room
      playerData.ship.x = roomData.shipX;
      playerData.ship.y = roomData.shipY;

      // Get or create new room and add player to it
      const newRoom = getOrCreateRoom(roomData.roomX, roomData.roomY);
      newRoom.players[socket.id] = playerData;

      // Join new socket.io room
      socket.join(newRoomId);

      // Send current players in new room to the player
      socket.emit('currentPlayers', newRoom.players);
      socket.emit('roomChanged', { roomX: roomData.roomX, roomY: roomData.roomY });

      // Notify new room players about this player
      socket.to(newRoomId).emit('newPlayer', playerData);
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
      return WORLD_WIDTH - Math.floor(Math.random() * 150) - 25
    } else { // axis === "y"
      return Math.floor(Math.random() * 150) + 25
    }
  }

  if (result === 2) {
    if (axis === "x") {
      return Math.floor(Math.random() * 150) + 25
    } else { // axis === "y"
      return WORLD_HEIGHT - Math.floor(Math.random() * 150) - 25
    }
  }

  if (result === 3) {
    if (axis === "x") {
      return WORLD_WIDTH - Math.floor(Math.random() * 150) - 25
    } else { // axis === "y"
      return WORLD_HEIGHT - Math.floor(Math.random() * 150) - 25
    }
  }

}

// Day/Night cycle update loop - broadcasts time to all clients every second
setInterval(function() {
  const now = Date.now();
  const elapsed = now - gameWorld.gameStartTime;

  // Calculate current time in cycle (loops back to 0 after full cycle)
  gameWorld.currentTime = (gameWorld.currentTime + 1000) % gameWorld.cycleLength;

  // Calculate time ratio (0-1, where 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset)
  gameWorld.timeRatio = gameWorld.currentTime / gameWorld.cycleLength;

  // Broadcast to ALL connected clients (not room-specific)
  io.emit('timeUpdate', {
    currentTime: gameWorld.currentTime,
    timeRatio: gameWorld.timeRatio,
    cycleLength: gameWorld.cycleLength
  });
}, 1000); // Update every 1 second

server.listen(3000, function () {
  console.log(`Listening on ${server.address().port}`);
});
