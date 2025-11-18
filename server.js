var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

// Load shared physics module
const shipPhysics = require('./shared/shipPhysics.js');

// Room-based structure: each room has ONE shared ship and multiple players (max 4)
var rooms = {};
const MAX_PLAYERS = 4;

// Portal position for Abyssal Compass (generated when first compass is collected)
var portalPosition = null; // Will be generated when someone collects Abyssal Compass

// Generate portal position relative to ship's current position
function generatePortalPosition(shipRoomX, shipRoomY) {
  const distance = 10; // rooms away from ship
  const angle = Math.random() * Math.PI * 2;
  return {
    roomX: shipRoomX + Math.round(Math.cos(angle) * distance),
    roomY: shipRoomY + Math.round(Math.sin(angle) * distance)
  };
}

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
    isAbyssal: false, // Found in normal world
    usesCurseSound: false // Uses blessing sound
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
    isAbyssal: false, // Found in normal world
    usesCurseSound: false // Uses blessing sound
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
    isAbyssal: false, // Found in normal world
    usesCurseSound: false // Uses blessing sound
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
    isAbyssal: false, // Found in normal world
    usesCurseSound: true // Uses curse sound despite being in normal world
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
    isAbyssal: true,
    usesCurseSound: true // Uses curse sound
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
    isAbyssal: true,
    usesCurseSound: true // Uses curse sound
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
    isAbyssal: true,
    usesCurseSound: true // Uses curse sound
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
    isAbyssal: true,
    usesCurseSound: true // Uses curse sound
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
    isAbyssal: true,
    usesCurseSound: true // Uses curse sound
  }
};
const MODIFIER_SPAWN_CHANCE = 0.5; // 50% chance to spawn a modifier in a room (deprecated - using individual chances now)
const MODIFIER_SIZE = 8;
const DEV_SPAWN_MULTIPLIER = 1.0; // Set to higher values for testing (e.g., 2.0 for 2x spawn rates)

// Abyssal Jelly configuration
const JELLY_SPAWN_CHANCE = 0.5; // 50% chance to spawn jellies in a room
const JELLY_SPAWN_CENTER_RADIUS = 400; // Spawn within this radius from center of each room
const JELLY_SIZE = 64; // Visual size
const JELLY_SPEED = 30; // Movement speed
const JELLY_FOLLOW_RANGE = 800; // Range at which jelly starts following ship
const JELLY_MIN_PER_ROOM = 1; // Minimum jellies per room
const JELLY_MAX_PER_ROOM = 3; // Maximum jellies per room
const JELLY_COLLISION_RADIUS = 40; // Collision detection radius
const JELLY_SHOCK_FORCE = 150; // Knockback force when ship hits jelly
const JELLY_SHOCK_COOLDOWN = 2000; // Cooldown in ms before jelly can shock again

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
      modifiers: [], // Power-ups that spawn in the room
      jellies: [] // Abyssal jellies (only visible in abyssal world)
    };

    // Spawn modifiers with a chance
    spawnModifiersInRoom(rooms[roomId], roomX, roomY);

    // Spawn abyssal jellies with a chance (only near center)
    spawnJelliesInRoom(rooms[roomId], roomX, roomY);
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
        usesCurseSound: modifierType.usesCurseSound || false, // Track which sound to use
        x: Math.random() * (WORLD_WIDTH - 100) + 50, // Random position with margin
        y: Math.random() * (WORLD_HEIGHT - 100) + 50,
        size: MODIFIER_SIZE
      };
      room.modifiers.push(modifier);
      console.log(`Spawned "${modifierType.name}" modifier in room (${roomX}, ${roomY}) at (${Math.floor(modifier.x)}, ${Math.floor(modifier.y)})`);
    }
  });
}

// Spawn abyssal jellies in a room (near center of each room)
function spawnJelliesInRoom(room, roomX, roomY) {
  // Single probability check: should this room have jellies?
  if (Math.random() > JELLY_SPAWN_CHANCE) {
    return; // No jellies in this room
  }

  // Spawn between MIN and MAX jellies
  const jellyCount = JELLY_MIN_PER_ROOM + Math.floor(Math.random() * (JELLY_MAX_PER_ROOM - JELLY_MIN_PER_ROOM + 1));

  console.log(`Spawning ${jellyCount} jellies in room (${roomX}, ${roomY})`);

  // Calculate room center
  const roomCenterX = WORLD_WIDTH / 2;
  const roomCenterY = WORLD_HEIGHT / 2;

  for (let i = 0; i < jellyCount; i++) {
    // Spawn near the center of the room within JELLY_SPAWN_CENTER_RADIUS
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * JELLY_SPAWN_CENTER_RADIUS;

    const jelly = {
      id: `jelly_${roomX}_${roomY}_${i}_${Date.now()}`,
      x: roomCenterX + Math.cos(angle) * distance,
      y: roomCenterY + Math.sin(angle) * distance,
      size: JELLY_SIZE,
      // Jellyfish movement properties
      velocityX: 0,
      velocityY: 0,
      phase: Math.random() * Math.PI * 2, // Random starting phase for wave motion
      baseSpeed: JELLY_SPEED,
      isFollowing: false,
      // Shock/attack properties
      lastShockTime: 0 // Last time this jelly shocked the ship
    };
    room.jellies.push(jelly);
    console.log(`  - Spawned Abyssal Jelly #${i+1} at (${Math.floor(jelly.x)}, ${Math.floor(jelly.y)})`);
  }
}

// Update jelly movement (jellyfish-like, follows ship when in range)
function updateJellyMovement(jelly, ship, deltaTime) {
  if (!ship) {
    // Idle floating movement
    jelly.phase += deltaTime * 2;
    jelly.velocityX = Math.sin(jelly.phase) * jelly.baseSpeed * 0.3;
    jelly.velocityY = Math.cos(jelly.phase * 0.7) * jelly.baseSpeed * 0.3;
    jelly.isFollowing = false;
  } else {
    // Calculate distance to ship
    const dx = ship.x - jelly.x;
    const dy = ship.y - jelly.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < JELLY_FOLLOW_RANGE) {
      // Follow the ship with jellyfish-like motion
      jelly.isFollowing = true;
      jelly.phase += deltaTime * 3;

      // Smooth attraction toward ship
      const attractionStrength = 0.5;
      const dirX = dx / distance;
      const dirY = dy / distance;

      // Add wave motion for jellyfish effect
      const waveOffsetX = Math.sin(jelly.phase) * 20;
      const waveOffsetY = Math.cos(jelly.phase * 1.3) * 20;

      jelly.velocityX = (dirX * jelly.baseSpeed * attractionStrength) + waveOffsetX;
      jelly.velocityY = (dirY * jelly.baseSpeed * attractionStrength) + waveOffsetY;
    } else {
      // Idle floating movement
      jelly.phase += deltaTime * 2;
      jelly.velocityX = Math.sin(jelly.phase) * jelly.baseSpeed * 0.3;
      jelly.velocityY = Math.cos(jelly.phase * 0.7) * jelly.baseSpeed * 0.3;
      jelly.isFollowing = false;
    }
  }

  // Apply velocity
  jelly.x += jelly.velocityX * deltaTime;
  jelly.y += jelly.velocityY * deltaTime;

  // Keep within room bounds
  jelly.x = Math.max(50, Math.min(WORLD_WIDTH - 50, jelly.x));
  jelly.y = Math.max(50, Math.min(WORLD_HEIGHT - 50, jelly.y));
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

// Check and handle jelly collisions with ship (shock/knockback effect)
function checkJellyCollisions(ship, room) {
  if (!ship || !room.jellies || room.jellies.length === 0) return [];

  const shipRadius = 50; // Approximate ship collision radius
  const now = Date.now();
  const shockedJellies = [];

  // Only check collisions if in abyssal world
  const hasAbyssVision = ship.modifiers && ship.modifiers.abyssVision;
  const inAbyssalWorld = hasAbyssVision && ship.lanternLit;

  if (!inAbyssalWorld) {
    return shockedJellies; // No collisions if not in abyssal world
  }

  for (let i = 0; i < room.jellies.length; i++) {
    const jelly = room.jellies[i];

    // Check if jelly is on cooldown
    if (jelly.lastShockTime && (now - jelly.lastShockTime) < JELLY_SHOCK_COOLDOWN) {
      continue; // Jelly can't shock yet
    }

    // Calculate distance between ship and jelly
    const dx = ship.x - jelly.x;
    const dy = ship.y - jelly.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < shipRadius + JELLY_COLLISION_RADIUS) {
      // Collision detected! Apply knockback
      const pushAngle = Math.atan2(dy, dx); // Direction from jelly to ship
      const pushX = Math.cos(pushAngle) * JELLY_SHOCK_FORCE;
      const pushY = Math.sin(pushAngle) * JELLY_SHOCK_FORCE;

      // Apply impulse to ship velocity
      ship.velocityX += pushX;
      ship.velocityY += pushY;

      // Update jelly cooldown
      jelly.lastShockTime = now;

      // Track shocked jellies for client notification
      shockedJellies.push({
        jellyId: jelly.id,
        jellyX: jelly.x,
        jellyY: jelly.y,
        pushAngle: pushAngle,
        pushForce: JELLY_SHOCK_FORCE
      });

      console.log(`Jelly ${jelly.id} shocked ship! Push: (${pushX.toFixed(1)}, ${pushY.toFixed(1)})`);
    }
  }

  return shockedJellies;
}

// Apply modifier effect to ship
function applyModifier(ship, modifierType, modifierId) {
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

  if (!ship.collectedModifiers) {
    ship.collectedModifiers = [];
  }

  const typeInfo = MODIFIER_TYPES[modifierType];
  if (!typeInfo) {
    return false;
  }

  // Check if ship already has this modifier type collected
  if (ship.collectedModifiers.includes(modifierType)) {
    console.log(`Ship already collected ${modifierType}, skipping`);
    return false;
  }

  // Apply the modifier
  ship.modifiers[typeInfo.effect] = true;
  ship.collectedModifiers.push(modifierType);
  console.log(`Applied ${modifierType} modifier to ship (total: ${ship.collectedModifiers.length})`);
  return true;
}

// Filter modifiers that ship hasn't collected yet
function getAvailableModifiers(room, ship) {
  if (!room || !room.modifiers || !ship) {
    return [];
  }

  if (!ship.collectedModifiers) {
    return room.modifiers; // Ship hasn't collected anything yet
  }

  // Return only modifiers that the ship hasn't collected
  return room.modifiers.filter(modifier => {
    return !ship.collectedModifiers.includes(modifier.type);
  });
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
    collectedModifiers: [], // Array of collected modifier IDs to track total count

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
  socket.emit('roomModifiers', getAvailableModifiers(room, room.ship)); // Send only modifiers not yet collected

  // Send portal position only if it exists (generated when Abyssal Compass is collected)
  if (portalPosition) {
    socket.emit('portalPosition', portalPosition);
  }

  socket.emit('roomJellies', room.jellies); // Send abyssal jellies in the room

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

      // Broadcast anchor state change immediately to all players in the room
      io.to(roomId).emit('anchorStateChanged', {
        isAnchored: data.isAnchored
      });
    }
  });

  // Handle crow's nest toggle
  socket.on('crowsNestToggle', function (data) {
    const roomId = getRoomId(socket.currentRoomX, socket.currentRoomY);
    const room = rooms[roomId];

    if (room && room.players[socket.id] && data) {
      room.players[socket.id].player.isInCrowsNest = data.isInCrowsNest;
      console.log(`Player ${socket.id} toggled crow's nest: ${data.isInCrowsNest ? 'UP' : 'DOWN'}`);

      // Broadcast crow's nest state change to all other players in the room
      socket.to(roomId).emit('playerCrowsNestChanged', {
        playerId: socket.id,
        isInCrowsNest: data.isInCrowsNest
      });
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
          playerSocket.emit('roomModifiers', getAvailableModifiers(newRoom, newRoom.ship)); // Send only modifiers not yet collected

          // Send portal position if it exists
          if (portalPosition) {
            playerSocket.emit('portalPosition', portalPosition);
          }

          playerSocket.emit('roomJellies', newRoom.jellies); // Send abyssal jellies in the new room
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
      // Try to apply the modifier to the ship (will fail if already collected)
      const applied = applyModifier(room.ship, collision.modifier.type, collision.modifier.id);

      if (applied) {
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
          usesCurseSound: collision.modifier.usesCurseSound || false,
          shipModifiers: room.ship.modifiers
        });

        // Special handling for Abyssal Compass: Generate portal
        if (collision.modifier.type === 'ABYSSAL_COMPASS' && !portalPosition) {
          // Parse room coordinates from roomId (format: "x,y")
          const [roomX, roomY] = roomId.split(',').map(Number);

          // Generate portal position relative to ship's current room
          portalPosition = generatePortalPosition(roomX, roomY);
          console.log(`[PORTAL] Generated portal at room (${portalPosition.roomX}, ${portalPosition.roomY}) - 10 rooms from ship at (${roomX}, ${roomY})`);

          // Broadcast portal position to ALL clients (not just current room)
          io.emit('portalPosition', portalPosition);
        }
      }
    }

    // Update abyssal jellies movement
    if (room.jellies && room.jellies.length > 0) {
      room.jellies.forEach(jelly => {
        updateJellyMovement(jelly, room.ship, DELTA_TIME);
      });

      // Check for jelly collisions with ship (shock/knockback)
      const shockedJellies = checkJellyCollisions(room.ship, room);
      if (shockedJellies.length > 0) {
        // Notify all clients in the room about the shock
        io.to(roomId).emit('jellyShock', {
          shocks: shockedJellies
        });
      }

      // Broadcast jelly positions to all players in room
      io.to(roomId).emit('jelliesUpdated', room.jellies);
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

server.listen(80, function () {
  console.log(`Listening on ${server.address().port}`);
});
