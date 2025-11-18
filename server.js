var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

// Load shared physics module
const shipPhysics = require('./shared/shipPhysics.js');

// Room-based structure: each room has ONE shared ship and multiple players (max 4)
var rooms = {};
const MAX_PLAYERS = 4;

// Portal position for Abyssal Compass (approximately 10 rooms away from origin)
function generatePortalPosition() {
  const distance = 10; // rooms
  const angle = Math.random() * Math.PI * 2;
  return {
    roomX: Math.round(Math.cos(angle) * distance),
    roomY: Math.round(Math.sin(angle) * distance)
  };
}
const portalPosition = generatePortalPosition();
console.log(`Portal generated at room (${portalPosition.roomX}, ${portalPosition.roomY})`);

// Modifier system constants
const MODIFIER_TYPES = {
  RIOS_WINDS: {
    id: 'rios_winds',
    name: "Río de la Plata's Winds",
    lore: "Southern winds will push you in every direction.",
    type: 'RIOS_WINDS',
    color: 0x00CED1, // Dark Cyan - water in motion
    effect: 'speed',
    bonus: 0.2,
    rarity: 'rare',
    spawnChance: 0.4, // 40% spawn chance
    isAbyssal: false // Found in normal world
  },
  CAPTAINS_GUIDE: {
    id: 'captains_guide',
    name: "Captain's Wisdom",
    lore: "An ancient hand guides your turns.",
    type: 'CAPTAINS_GUIDE',
    color: 0xFFD700, // Gold - navigator's light
    effect: 'turning',
    bonus: 0.25,
    rarity: 'common',
    spawnChance: 0.6, // 60% spawn chance (common)
    isAbyssal: false // Found in normal world
  },
  PIRATES_TENACITY: {
    id: 'pirates_tenacity',
    name: "Pirate's Tenacity",
    lore: "Those who persist are never truly defeated.",
    type: 'PIRATES_TENACITY',
    color: 0xDC143C, // Crimson - relentless fire
    effect: 'fireRate',
    bonus: 0.3,
    rarity: 'rare',
    spawnChance: 0.4, // 40% spawn chance
    isAbyssal: false // Found in normal world
  },
  ABYSS_LANTERN: {
    id: 'abyss_lantern',
    name: "Lantern of the Abyss",
    lore: "See the void with its own eyes.",
    type: 'ABYSS_LANTERN',
    color: 0x7A00FF, // Violeta abismal
    effect: 'abyssVision', // Only provides abyss vision, not bullet speed
    bonus: 1.0, // No numeric bonus, just enables abyss world
    rarity: 'legendary',
    spawnChance: 0.15, // 15% spawn chance (legendary)
    isAbyssal: false // Found in normal world
  },

  // ===== ABYSSAL MODIFIERS (only visible with Abyss Lantern active) =====

  TEMPEST_ABYSS: {
    id: 'tempest_abyss',
    name: "Tempest of the Abyss",
    lore: "The abyss commands the storm.",
    type: 'TEMPEST_ABYSS',
    color: 0x7A00FF, // Violet
    effect: 'speed',
    bonus: 0.4, // +40% speed
    rarity: 'epic',
    spawnChance: 0.25, // 25% spawn chance (epic)
    isAbyssal: true
  },
  ETHEREAL_HELM: {
    id: 'ethereal_helm',
    name: "Ethereal Helm",
    lore: "Steer through dimensions.",
    type: 'ETHEREAL_HELM',
    color: 0x7A00FF, // Violet
    effect: 'turning',
    bonus: 0.5, // +50% turning
    rarity: 'epic',
    spawnChance: 0.25, // 25% spawn chance (epic)
    isAbyssal: true
  },
  ENDLESS_BARRAGE: {
    id: 'endless_barrage',
    name: "Endless Barrage",
    lore: "The void reloads your cannons.",
    type: 'ENDLESS_BARRAGE',
    color: 0x7A00FF, // Violet
    effect: 'fireRate',
    bonus: 0.6, // -60% cooldown
    rarity: 'epic',
    spawnChance: 0.25, // 25% spawn chance (epic)
    isAbyssal: true
  },
  ABYSSAL_COMPASS: {
    id: 'abyssal_compass',
    name: "Abyssal Compass",
    lore: "Points toward hidden riches.",
    type: 'ABYSSAL_COMPASS',
    color: 0xFFD700, // Gold
    effect: 'compass',
    bonus: 1.0,
    rarity: 'cursed',
    spawnChance: 0.12, // 12% spawn chance (cursed/rare)
    isAbyssal: true
  },
  CURSE_GREED: {
    id: 'curse_greed',
    name: "Curse of Greed",
    lore: "More treasures, greater dangers.",
    type: 'CURSE_GREED',
    color: 0xFF4500, // Red-orange
    effect: 'greed',
    bonus: 2.0, // 2x modifier spawn chance
    rarity: 'cursed',
    spawnChance: 0.1, // 10% spawn chance (very rare)
    isAbyssal: true
  }
};
const MODIFIER_SPAWN_CHANCE = 0.5; // 50% chance to spawn a modifier in a room (deprecated - using individual chances now)
const MODIFIER_SIZE = 8;
const DEV_SPAWN_MULTIPLIER = 1.0; // Set to higher values for testing (e.g., 2.0 for 2x spawn rates)

// Server tick configuration
const SERVER_TICK_RATE = 60; // Hz
const SERVER_TICK_INTERVAL = 1000 / SERVER_TICK_RATE; // ms
const DELTA_TIME = 1 / SERVER_TICK_RATE; // seconds

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
      bullets: [],
      modifiers: [] // Power-ups that spawn in the room
    };

    // Spawn modifiers with a chance
    spawnModifiersInRoom(rooms[roomId], roomX, roomY);
  }
  return rooms[roomId];
}

// Get player count in a room
function getPlayerCount(room) {
  return Object.keys(room.players).length;
}

// Spawn modifiers in a room with a probability
function spawnModifiersInRoom(room, roomX, roomY) {
  const modifierTypesArray = Object.values(MODIFIER_TYPES);

  // Each modifier type has its own individual spawn chance
  modifierTypesArray.forEach(modifierType => {
    // Apply dev multiplier to spawn chance (capped at 1.0 = 100%)
    const effectiveSpawnChance = Math.min(1.0, modifierType.spawnChance * DEV_SPAWN_MULTIPLIER);

    if (Math.random() < effectiveSpawnChance) {
      const modifier = {
        id: `${roomX},${roomY}_${modifierType.type}_${Date.now()}`,
        modifierId: modifierType.id,
        type: modifierType.type,
        name: modifierType.name,
        lore: modifierType.lore,
        rarity: modifierType.rarity,
        color: modifierType.color,
        effect: modifierType.effect,
        bonus: modifierType.bonus,
        isAbyssal: modifierType.isAbyssal || false, // Track which world it belongs to
        x: Math.random() * (WORLD_WIDTH - 100) + 50, // Random position with margin
        y: Math.random() * (WORLD_HEIGHT - 100) + 50,
        size: MODIFIER_SIZE
      };
      room.modifiers.push(modifier);
      console.log(`Spawned "${modifierType.name}" modifier in room (${roomX}, ${roomY}) at (${Math.floor(modifier.x)}, ${Math.floor(modifier.y)})`);
    }
  });
}

// Check if ship collides with a modifier
function checkModifierCollisions(ship, room) {
  if (!ship || !room.modifiers) return null;

  const shipRadius = 50; // Approximate ship collision radius

  // Determine if player is in the abyssal world
  const hasAbyssVision = ship.modifiers && ship.modifiers.abyssVision;
  const inAbyssalWorld = hasAbyssVision && ship.lanternLit;

  for (let i = 0; i < room.modifiers.length; i++) {
    const modifier = room.modifiers[i];
    const dx = ship.x - modifier.x;
    const dy = ship.y - modifier.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < shipRadius + modifier.size) {
      // Check if the modifier is in the correct dimension
      const isAbyssalItem = modifier.isAbyssal || false;

      // Can only pick up abyssal items if in abyssal world
      // Can only pick up normal items if NOT in abyssal world
      if (isAbyssalItem === inAbyssalWorld) {
        // Collision detected and dimension matches!
        return { modifier, index: i };
      }
    }
  }

  return null;
}

// Apply modifier effect to ship
function applyModifier(ship, modifierType) {
  if (!ship.modifiers) {
    ship.modifiers = {
      speed: false,
      turning: false,
      fireRate: false,
      abyssVision: false,
      compass: false,
      greed: false
    };
  }

  const typeInfo = MODIFIER_TYPES[modifierType];
  if (typeInfo) {
    ship.modifiers[typeInfo.effect] = true;
    console.log(`Applied ${modifierType} modifier to ship`);
  }
}

// Create shared ship for a room
function createShip(x, y) {
  return {
    // Physics state
    x: x,
    y: y,
    rotation: 0,
    velocityX: 0,
    velocityY: 0,
    angularVelocity: 0,
    currentSpeed: 0,
    steeringDirection: 0,  // -100 to +100
    isAnchored: true,

    // Visual/gameplay state
    lanternLit: false,
    targetSpeed: 0,
    cannons: {
      leftAngle: 0,
      rightAngle: 0
    },

    // Modifier state
    modifiers: {
      speed: false,
      turning: false,
      fireRate: false,
      abyssVision: false,
      compass: false,
      greed: false
    },

    // Server-side input management
    pendingInputs: [],     // Queue of unprocessed inputs
    lastProcessedInput: 0, // Sequence number of last processed input
    controllingPlayer: null // Socket ID of player controlling ship
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

  // Join the socket.io room for this ship
  socket.join(roomId);

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
      cannonSide: null,
      isInCrowsNest: false,
      velocityX: 0, // Initialize velocity for animation sync
      velocityY: 0,
      isMoving: false // Initialize as not moving
    }
  };

  // Send shared ship FIRST, then players (ensures ship exists when creating avatars)
  socket.emit('sharedShip', room.ship); // Send the shared ship data FIRST
  socket.emit('currentPlayers', room.players);
  socket.emit('roomChanged', { roomX: initialRoomX, roomY: initialRoomY });
  socket.emit('roomModifiers', room.modifiers); // Send modifiers in the room
  socket.emit('portalPosition', portalPosition); // Send portal position for Abyssal Compass

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

  // Handle ship control inputs (NEW: Input-based, not state-based)
  socket.on('shipInput', function (inputData) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.ship && inputData) {
      // Set controlling player
      if (inputData.isControlling) {
        room.ship.controllingPlayer = socket.id;
      } else if (room.ship.controllingPlayer === socket.id) {
        room.ship.controllingPlayer = null;
      }

      // Queue input for processing in tick loop
      if (inputData.isControlling && inputData.steering) {
        room.ship.pendingInputs.push({
          sequence: inputData.sequence,
          turnLeft: inputData.steering.left,
          turnRight: inputData.steering.right,
          timestamp: Date.now()
        });
      }

      // Update non-physics state (anchor, cannons, etc.)
      if (inputData.anchor !== undefined) {
        room.ship.isAnchored = inputData.anchor;
      }
      if (inputData.cannons) {
        room.ship.cannons = inputData.cannons;
      }
    }
  });

  // Handle anchor toggle
  socket.on('anchorToggle', function (data) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.ship && data) {
      room.ship.isAnchored = data.isAnchored;
      console.log(`Player ${socket.id} toggled anchor: ${data.isAnchored ? 'DOWN' : 'UP'}`);
    }
  });

  // Handle crow's nest toggle
  socket.on('crowsNestToggle', function (data) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.players[socket.id] && data) {
      room.players[socket.id].player.isInCrowsNest = data.isInCrowsNest;
      console.log(`Player ${socket.id} toggled crow's nest: ${data.isInCrowsNest ? 'UP' : 'DOWN'}`);
    }
  });

  // Handle player avatar movement (still client-authoritative for now)
  socket.on('playerMovement', function (movementData) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.players[socket.id] && movementData) {
      // Update player avatar data only
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

        // Sincronizar estado de la cofa
        if (movementData.player.isInCrowsNest !== undefined) {
          room.players[socket.id].player.isInCrowsNest = movementData.player.isInCrowsNest;
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

      // Get all players on the ship (they all move together)
      const playersOnShip = Object.keys(oldRoom.players);
      const newRoom = getOrCreateRoom(roomData.roomX, roomData.roomY);

      // Move ship to new room
      const ship = oldRoom.ship;
      ship.x = roomData.shipX;
      ship.y = roomData.shipY;
      newRoom.ship = ship;
      oldRoom.ship = null;

      // Move all players to new room and update their coordinates
      playersOnShip.forEach(playerId => {
        const playerData = oldRoom.players[playerId];
        const playerSocket = io.sockets.connected[playerId];

        if (playerData && playerSocket) {
          // Remove from old room data
          delete oldRoom.players[playerId];

          // Move socket from old Socket.IO room to new one
          playerSocket.leave(oldRoomId);
          playerSocket.join(newRoomId);

          // Update room coordinates
          playerSocket.currentRoomX = roomData.roomX;
          playerSocket.currentRoomY = roomData.roomY;
          playerData.roomX = roomData.roomX;
          playerData.roomY = roomData.roomY;

          // Add to new room data
          newRoom.players[playerId] = playerData;

          // Notify this player about the room change
          playerSocket.emit('roomChanged', { roomX: roomData.roomX, roomY: roomData.roomY });
          playerSocket.emit('sharedShip', newRoom.ship);
          playerSocket.emit('roomModifiers', newRoom.modifiers); // Send modifiers in the new room
        }
      });

      console.log(`Moved ${playersOnShip.length} players from ${oldRoomId} to ${newRoomId}`);

    } catch (error) {
      console.error(`Error changing room for ship:`, error);
      socket.emit('roomChangeError', { message: 'Failed to change room' });
    }
  });

  socket.on('cannonRotation', function(data) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];
    if (room && room.ship && data) {
      room.ship.cannons = {
        leftAngle: data.leftAngle || 0,
        rightAngle: data.rightAngle || 0
      };
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

// ===== SERVER TICK LOOP (60Hz) =====
// Authoritative physics simulation
setInterval(function() {
  // Process physics for all rooms
  Object.keys(rooms).forEach(roomId => {
    const room = rooms[roomId];

    if (!room || !room.ship) return;

    // Get the ship's controlling player input (if any)
    let shipInput = {
      turnLeft: false,
      turnRight: false
    };

    // Process pending inputs from controlling player
    if (room.ship.controllingPlayer && room.ship.pendingInputs.length > 0) {
      // Process all pending inputs (in order)
      room.ship.pendingInputs.forEach(input => {
        shipInput = {
          turnLeft: input.turnLeft,
          turnRight: input.turnRight
        };

        // Update ship state using shared physics (with modifiers)
        const newState = shipPhysics.updateShipPhysics(
          {
            x: room.ship.x,
            y: room.ship.y,
            rotation: room.ship.rotation,
            steeringDirection: room.ship.steeringDirection,
            currentSpeed: room.ship.currentSpeed,
            isAnchored: room.ship.isAnchored
          },
          shipInput,
          DELTA_TIME,
          room.ship.modifiers // Pass modifiers to physics calculation
        );

        // Apply new state
        room.ship.x = newState.x;
        room.ship.y = newState.y;
        room.ship.rotation = newState.rotation;
        room.ship.steeringDirection = newState.steeringDirection;
        room.ship.currentSpeed = newState.currentSpeed;
        room.ship.velocityX = newState.velocityX;
        room.ship.velocityY = newState.velocityY;
        room.ship.angularVelocity = newState.angularVelocity;

        // Track last processed input
        room.ship.lastProcessedInput = input.sequence;
      });

      // Clear processed inputs
      room.ship.pendingInputs = [];
    } else {
      // No controlling player - still update physics with no input (with modifiers)
      const newState = shipPhysics.updateShipPhysics(
        {
          x: room.ship.x,
          y: room.ship.y,
          rotation: room.ship.rotation,
          steeringDirection: room.ship.steeringDirection,
          currentSpeed: room.ship.currentSpeed,
          isAnchored: room.ship.isAnchored
        },
        shipInput,
        DELTA_TIME,
        room.ship.modifiers // Pass modifiers to physics calculation
      );

      // Apply new state
      room.ship.x = newState.x;
      room.ship.y = newState.y;
      room.ship.rotation = newState.rotation;
      room.ship.steeringDirection = newState.steeringDirection;
      room.ship.currentSpeed = newState.currentSpeed;
      room.ship.velocityX = newState.velocityX;
      room.ship.velocityY = newState.velocityY;
      room.ship.angularVelocity = newState.angularVelocity;
    }

    // Check for modifier collisions
    const collision = checkModifierCollisions(room.ship, room);
    if (collision) {
      // Apply the modifier to the ship
      applyModifier(room.ship, collision.modifier.type);

      // Remove the modifier from the room
      room.modifiers.splice(collision.index, 1);

      // Notify all clients in the room
      io.to(roomId).emit('modifierCollected', {
        modifierId: collision.modifier.id,
        modifierType: collision.modifier.type,
        modifierName: collision.modifier.name,
        modifierLore: collision.modifier.lore,
        modifierRarity: collision.modifier.rarity,
        modifierColor: collision.modifier.color,
        isAbyssal: collision.modifier.isAbyssal || false,
        shipModifiers: room.ship.modifiers
      });
    }

    // Broadcast authoritative ship state to all players in room
    io.to(roomId).emit('shipMoved', {
      x: room.ship.x,
      y: room.ship.y,
      rotation: room.ship.rotation,
      velocityX: room.ship.velocityX,
      velocityY: room.ship.velocityY,
      steeringDirection: room.ship.steeringDirection,
      currentSpeed: room.ship.currentSpeed,
      isAnchored: room.ship.isAnchored,
      targetSpeed: room.ship.targetSpeed,
      lastProcessedInput: room.ship.lastProcessedInput, // For client reconciliation
      cannons: room.ship.cannons,
      modifiers: room.ship.modifiers // Include active modifiers
    });
  });
}, SERVER_TICK_INTERVAL);

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
