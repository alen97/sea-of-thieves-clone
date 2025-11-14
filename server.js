var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

// Room-based structure: each room has ONE shared ship and multiple players (max 4)
var rooms = {};
const MAX_PLAYERS = 4;

// Day/Night cycle - Server authoritative time
var gameWorld = {
  cycleLength: 60 * 60 * 1000, // 60 minutes for full day/night cycle
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
      ship: null, // Shared ship for all players in room (created with first player)
      players: {}, // Player avatars only
      bullets: []
    };
  }
  return rooms[roomId];
}

// Get player count in a room
function getPlayerCount(room) {
  return Object.keys(room.players).length;
}

// Create shared ship for a room
function createShip(x, y) {
  return {
    x: x,
    y: y,
    rotation: 0,
    velocityX: 0,
    velocityY: 0,
    lanternLit: false,
    isAnchored: true,      // Critical: for wake particles sync
    currentSpeed: 0,       // Critical: for wake particles intensity
    targetSpeed: 0,        // Critical: for navigation level sync
    steeringDirection: 0,  // Ship steering wheel position (-100 to +100)
    cannons: {
      leftAngle: 0,
      rightAngle: 0
    }
  };
}

// Get all adjacent rooms (3x3 grid: current room + 8 neighbors)
function getAdjacentRooms(roomX, roomY) {
  const adjacentRooms = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      adjacentRooms.push({
        roomX: roomX + dx,
        roomY: roomY + dy,
        roomId: getRoomId(roomX + dx, roomY + dy)
      });
    }
  }
  return adjacentRooms;
}

// Join socket to all adjacent rooms for awareness
function joinAdjacentRooms(socket, roomX, roomY) {
  if (!socket || !socket.connected) {
    console.log('Cannot join rooms: socket not connected');
    return;
  }

  const adjacentRooms = getAdjacentRooms(roomX, roomY);
  adjacentRooms.forEach(room => {
    try {
      socket.join(room.roomId);
    } catch (error) {
      console.error(`Error joining room ${room.roomId}:`, error.message);
    }
  });
}

// Leave all adjacent rooms
function leaveAdjacentRooms(socket, roomX, roomY) {
  if (!socket || !socket.connected) {
    console.log('Cannot leave rooms: socket not connected');
    return;
  }

  const adjacentRooms = getAdjacentRooms(roomX, roomY);
  adjacentRooms.forEach(room => {
    try {
      socket.leave(room.roomId);
    } catch (error) {
      console.error(`Error leaving room ${room.roomId}:`, error.message);
    }
  });
}

// Get all players in adjacent rooms for seamless rendering
function getPlayersInAdjacentRooms(roomX, roomY) {
  const adjacentRooms = getAdjacentRooms(roomX, roomY);
  const allPlayers = {};

  adjacentRooms.forEach(room => {
    const roomData = rooms[room.roomId];
    if (roomData && roomData.players) {
      Object.values(roomData.players).forEach(player => {
        allPlayers[player.playerId] = player;
      });
    }
  });

  return allPlayers;
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

  // Validate max 4 players
  const currentPlayerCount = getPlayerCount(room);
  if (currentPlayerCount >= MAX_PLAYERS) {
    console.log(`Server full: ${currentPlayerCount}/${MAX_PLAYERS} players. Rejecting ${socket.id}`);
    socket.emit('serverFull', {
      message: `Server is full (${MAX_PLAYERS}/${MAX_PLAYERS} players)`
    });
    socket.disconnect(true);
    return;
  }

  // Join the socket.io room and all adjacent rooms for seamless experience
  joinAdjacentRooms(socket, initialRoomX, initialRoomY);

  // Store room info in socket
  socket.currentRoomX = initialRoomX;
  socket.currentRoomY = initialRoomY;

  // Create ship if this is the first player
  const isFirstPlayer = currentPlayerCount === 0;
  if (isFirstPlayer) {
    const initialX = resolveInitialPosition("x");
    const initialY = resolveInitialPosition("y");
    room.ship = createShip(initialX, initialY);
    console.log(`First player ${socket.id} created ship at (${initialX}, ${initialY})`);
  } else {
    console.log(`Player ${socket.id} joining existing ship (${currentPlayerCount + 1}/${MAX_PLAYERS})`);
  }

  // Create player avatar data only (ship is now shared)
  room.players[socket.id] = {
    playerId: socket.id,
    roomX: initialRoomX,
    roomY: initialRoomY,
    player: {
      x: 0, // Relative to ship
      y: 0, // Relative to ship
      rotation: Math.PI,
      isControllingShip: false,
      isOnCannon: false,
      cannonSide: null
    }
  };

  // Send shared ship FIRST, then players (ensures ship exists when creating avatars)
  const adjacentPlayers = getPlayersInAdjacentRooms(initialRoomX, initialRoomY);
  socket.emit('sharedShip', room.ship); // Send the shared ship data FIRST
  socket.emit('currentPlayers', adjacentPlayers);
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

      // Check if this was the last player
      const remainingPlayers = getPlayerCount(room);
      if (remainingPlayers === 0 && room.ship) {
        // Destroy ship when last player leaves
        console.log(`Last player left room ${roomId}. Destroying ship.`);
        room.ship = null;
        io.to(roomId).emit('shipDestroyed');
      }

      // Emit to players in the same room only
      io.to(roomId).emit('playerLeft', socket.id);
    }
  });

  // when a player moves, update the player data and shared ship
  socket.on('playerMovement', function (movementData) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.players[socket.id] && room.ship && movementData) {
      // Update shared ship data (if ship data is provided)
      if (movementData.ship) {
        room.ship.x = movementData.ship.x;
        room.ship.y = movementData.ship.y;
        room.ship.rotation = movementData.ship.rotation;
        room.ship.velocityX = movementData.ship.velocityX || 0;
        room.ship.velocityY = movementData.ship.velocityY || 0;

        // Sync critical properties for particles and game state
        if (movementData.ship.isAnchored !== undefined) {
          room.ship.isAnchored = movementData.ship.isAnchored;
        }
        if (movementData.ship.currentSpeed !== undefined) {
          room.ship.currentSpeed = movementData.ship.currentSpeed;
        }
        if (movementData.ship.targetSpeed !== undefined) {
          room.ship.targetSpeed = movementData.ship.targetSpeed;
        }
        if (movementData.ship.steeringDirection !== undefined) {
          room.ship.steeringDirection = movementData.ship.steeringDirection;
        }

        // Sincronizar ángulos de los cañones
        if (movementData.ship.cannons) {
          room.ship.cannons = movementData.ship.cannons;
        }

        // Basic validation (anti-exploit, cooperative trust model)
        const speed = Math.sqrt(room.ship.velocityX ** 2 + room.ship.velocityY ** 2);
        if (speed > 400) {
          console.warn(`Player ${socket.id} exceeded max speed: ${speed.toFixed(2)}`);
          // Don't reject in coop mode, just log
        }

        // Broadcast ship update to all players in room
        io.to(roomId).emit('shipMoved', room.ship);
      }

      // Update player avatar data
      if (movementData.player) {
        room.players[socket.id].player.x = movementData.player.x;
        room.players[socket.id].player.y = movementData.player.y;
        room.players[socket.id].player.rotation = movementData.player.rotation;
        room.players[socket.id].player.isControllingShip = movementData.player.isControllingShip;
        room.players[socket.id].player.isMoving = movementData.player.isMoving || false;
        room.players[socket.id].player.velocityX = movementData.player.velocityX || 0;
        room.players[socket.id].player.velocityY = movementData.player.velocityY || 0;

        // Sincronizar estado del cañón
        if (movementData.player.isOnCannon !== undefined) {
          room.players[socket.id].player.isOnCannon = movementData.player.isOnCannon;
        }
        if (movementData.player.cannonSide !== undefined) {
          room.players[socket.id].player.cannonSide = movementData.player.cannonSide;
        }

        // Broadcast player update to others in room
        socket.to(roomId).emit('playerMoved', room.players[socket.id]);
      }
    }
  });

  // CREATE BULLET
  socket.on('createBullet', function (creationData) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room) {
      console.log("creationData (server): ", creationData);
      console.log("Broadcasting bullet to room", roomId, "from shooter", creationData.shooterId);
      console.log("Players in room:", Object.keys(room.players));
      room.bullets.push({ id: room.bullets.length });
      // Emit to all players in the same room
      io.to(roomId).emit('newBullet', creationData);
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

  // when a player toggles the lantern
  socket.on('toggleLantern', function () {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.ship) {
      // Toggle lantern state on shared ship
      room.ship.lanternLit = !room.ship.lanternLit;

      // Broadcast new state to all players in room
      io.to(roomId).emit('lanternToggled', {
        lanternLit: room.ship.lanternLit
      });
    }
  });

  // when ship changes room (all players move together with shared ship)
  socket.on('changeRoom', function (roomData) {
    try {
      // Validate room data
      if (!roomData || roomData.roomX === undefined || roomData.roomY === undefined) {
        console.error(`Invalid room data received from ${socket.id}:`, roomData);
        socket.emit('roomChangeError', { message: 'Invalid room data' });
        return;
      }

      const oldRoomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
      const newRoomId = getRoomId(roomData.roomX, roomData.roomY);

      // Skip if already in target room
      if (oldRoomId === newRoomId) {
        return;
      }

      console.log(`Ship changing from room ${oldRoomId} to ${newRoomId} (triggered by ${socket.id})`);

      const oldRoom = rooms[oldRoomId];
      if (!oldRoom || !oldRoom.ship) {
        console.error(`Cannot change room: no ship in ${oldRoomId}`);
        return;
      }

      // Move ALL players and the ship to new room
      const playersToMove = Object.keys(oldRoom.players);
      const newRoom = getOrCreateRoom(roomData.roomX, roomData.roomY);

      // Move ship to new room
      const ship = oldRoom.ship;
      ship.x = roomData.shipX;
      ship.y = roomData.shipY;
      newRoom.ship = ship;
      oldRoom.ship = null;

      // Move all players to new room
      playersToMove.forEach(playerId => {
        const playerData = oldRoom.players[playerId];
        const playerSocket = io.sockets.connected[playerId];

        if (playerData && playerSocket) {
          // Remove from old room
          delete oldRoom.players[playerId];

          // Leave old socket.io rooms
          leaveAdjacentRooms(playerSocket, playerSocket.currentRoomX, playerSocket.currentRoomY);

          // Update room coordinates
          playerSocket.currentRoomX = roomData.roomX;
          playerSocket.currentRoomY = roomData.roomY;
          playerData.roomX = roomData.roomX;
          playerData.roomY = roomData.roomY;

          // Add to new room
          newRoom.players[playerId] = playerData;

          // Join new socket.io rooms
          joinAdjacentRooms(playerSocket, roomData.roomX, roomData.roomY);

          // Send updated data to this player
          const adjacentPlayers = getPlayersInAdjacentRooms(roomData.roomX, roomData.roomY);
          playerSocket.emit('currentPlayers', adjacentPlayers);
          playerSocket.emit('sharedShip', newRoom.ship);
          playerSocket.emit('roomChanged', { roomX: roomData.roomX, roomY: roomData.roomY });
        }
      });

      // Notify old room that ship and players left
      io.to(oldRoomId).emit('shipDestroyed');

      // Notify new room about new ship and players
      io.to(newRoomId).emit('sharedShip', newRoom.ship);
      playersToMove.forEach(playerId => {
        if (newRoom.players[playerId]) {
          io.to(newRoomId).emit('newPlayer', newRoom.players[playerId]);
        }
      });

    } catch (error) {
      console.error(`Error changing room for ship:`, error);
      socket.emit('roomChangeError', { message: 'Failed to change room' });
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
