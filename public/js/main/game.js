// World configuration
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 3200;
const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 1600;

// Zoom configuration
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.5;

// Maximum distance to render players from adjacent rooms (in pixels)
const MAX_RENDER_DISTANCE = 2000;

var config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.ENVELOP,
    parent: 'phaser-example',
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT
  },
  disableContextMenu: true,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update,
    key: 'MainScene'
  }
};

var game = new Phaser.Game(config);

function preload() {
  this.load.image('ship', 'assets/ship.png');
  this.load.image('player', 'assets/player.png');
  this.load.image('otherPlayer', 'assets/ship.png');

  this.load.audio('enterGame', ['sounds/portalenter.ogg', 'sounds/portalenter.mp3']);

  // Ambient background music
  this.load.audio('deepSeaNoise', 'sounds/deep_sea_noise.mp3');

  // Modifier potion sprite
  this.load.image('potionModifier', 'assets/potion_modifier.png');

  this.load.image('bullet', 'assets/bullet.png');
  this.load.image('cannon', 'assets/cannon.png');

  this.load.audio('shoot', 'sounds/bow5.mp3');

  // Anchor sounds
  this.load.audio('anchorDrop', 'sounds/anchor-chain-drop.wav');
  this.load.audio('anchorRise', 'sounds/anchor-chain-rising.mp3');

  // Lantern sounds
  this.load.audio('lanternLight', 'sounds/light-fire.wav');
  this.load.audio('lanternExtinguish', 'sounds/extinguish-fire.wav');

  // Modifier collection sounds
  this.load.audio('blessing', 'sounds/blessing.ogg');
  this.load.audio('curse', 'sounds/curse.wav');

  // Load player run animation atlas
  this.load.atlas('playerRun', 'assets/player_run.png', 'assets/player_run.json');

}

function create() {

  let canvas = this.sys.canvas;
  canvas.style.cursor = 'none';

  var enterGame = this.sound.add('enterGame');
  enterGame.setVolume(0.1)
  enterGame.play()
  game.sound.context.resume();

  // Ambient deep sea noise with fade in
  this.deepSeaAmbient = this.sound.add('deepSeaNoise', {
    loop: true, // Continuous loop
    volume: 0 // Start at 0 for fade in
  });

  // Play the ambient sound
  this.deepSeaAmbient.play();

  // Fade in at the start
  this.tweens.add({
    targets: this.deepSeaAmbient,
    volume: 0.25, // Target volume (15% to keep it ambient)
    duration: 3000, // 3 second fade in
    ease: 'Sine.easeInOut'
  });

  let { width, height } = this.sys.game.canvas;

  this.windowData = { width: width, height: height }

  this.input.setDefaultCursor('none');

  // game.scale.startFullscreen();
  this.cameras.main.setViewport(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  this.cameras.main.setZoom(1);
  this.currentZoom = 1;

  // Generar textura de océano en runtime
  const oceanGraphics = this.add.graphics();
  oceanGraphics.fillStyle(0x1E90FF, 1); // Color océano azul
  oceanGraphics.fillRect(0, 0, 16, 16);
  oceanGraphics.generateTexture('oceanTile', 16, 16);
  oceanGraphics.destroy();

  // Crear TileSprite para el fondo del océano (3x3 rooms para seamless experience)
  // Fixed position since room coordinates are local (0-3200 in each room)
  const OCEAN_SIZE = WORLD_WIDTH * 3; // 9600x9600 to cover 9 rooms
  this.oceanBackground = this.add.tileSprite(-WORLD_WIDTH, -WORLD_HEIGHT, OCEAN_SIZE, OCEAN_SIZE, 'oceanTile');
  this.oceanBackground.setOrigin(0, 0);
  this.oceanBackground.setDepth(-1);

  // NO configurar límites del mundo - necesitamos detectar cuando el barco cruza para cambiar de room
  // this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Inicializar sistema de partículas de estela
  createWakeParticleSystem(this);

  // Create player run animation
  this.anims.create({
    key: 'run',
    frames: this.anims.generateFrameNames('playerRun', {
      start: 0,
      end: 7,
      prefix: 'tile',
      suffix: '.png',
      zeroPad: 3
    }),
    frameRate: 10,
    repeat: -1
  });

  var self = this;
  this.socket = io();

  // Room tracking
  this.currentRoomX = 0;
  this.currentRoomY = 0;
  this.visitedRooms = new Set();
  this.visitedRooms.add('0,0'); // Add initial room
  this.mapVisible = false;
  this.chatMode = false;

  // Network optimization: track last sent values for throttling
  this.lastSentSteeringDirection = 0;
  this.lastSentCannonLeft = 0;
  this.lastSentCannonRight = 0;
  this.lastSentIsMoving = false; // Track player movement state for animation sync
  this.lastNetworkSendTime = 0;

  // Client prediction & input buffering
  this.inputSequence = 0; // Incrementing sequence number for each input
  this.pendingInputs = []; // Buffer of unacknowledged inputs
  this.lastServerState = null; // Last received authoritative state

  // Day/Night cycle - synchronized from server
  this.gameTime = {
    currentTime: 0,
    timeRatio: 0.5, // Start at noon
    cycleLength: 5 * 60 * 1000
  };

  // Crear una escena de "UI" que se superpondrá a la escena principal
  self.scene.add('UIScene', UIScene, true);

  // Initialize game systems
  this.inputSystem = new InputSystem(this);
  this.helmSystem = new HelmSystem(this);
  this.anchorSystem = new AnchorSystem(this);
  this.cannonSystem = new CannonSystem(this);
  this.crowsNestSystem = new CrowsNestSystem(this);

  // Groups
  this.otherPlayers = this.physics.add.group(); // Renamed: now stores other player avatars
  this.otherBullets = this.physics.add.group();
  this.modifiers = this.add.group(); // Power-ups in the current room

  // Track active ship modifiers
  this.shipModifiers = {
    speed: false,
    turning: false,
    fireRate: false,
    abyssVision: false,
    compass: false,
    greed: false
  };

  // Track modifiers in the order they were collected (for HUD display)
  this.shipModifiersArray = [];

  // Handle server full event
  this.socket.on('serverFull', function (data) {
    alert(data.message || 'Server is full. Please try again later.');
    console.error('Server is full');
  });

  // Handle shared ship data from server
  this.socket.on('sharedShip', function (shipData) {
    if (!self.ship) {
      // Create my ship for the first time
      self.ship = addShip(self, shipData);
      self.ship.playerId = self.socket.id;

      self.player = addPlayer(self, { x: 0, y: 0, rotation: Math.PI, isControllingShip: false }, self.ship);

      setupShipCollisions(self, self.ship);
      addShipWakeEmitters(self, self.ship);

      // Create cannons for the ship
      self.ship.cannons = self.cannonSystem.createCannons(self.ship)

      // Create lantern at ship center
      self.lanternLit = false;
      self.lantern = createLantern(self, self.ship, self.lanternLit);

      // Create crow's nest visual
      self.crowsNestSystem.createVisual(self.ship);

      // Initialize steering variable from server state
      self.steeringDirection = shipData.steeringDirection || 0;
    } else {
      // Update existing ship position (for room transitions)
      self.ship.setPosition(shipData.x, shipData.y);
      self.ship.setRotation(shipData.rotation);
      self.ship.lanternLit = shipData.lanternLit;
      self.ship.isAnchored = shipData.isAnchored !== undefined ? shipData.isAnchored : true;
      self.ship.currentSpeed = shipData.currentSpeed || 0;
      self.ship.targetSpeed = shipData.targetSpeed || 0;
      self.steeringDirection = shipData.steeringDirection || 0;
    }
  });

  // Handle ship movement updates
  this.socket.on('shipMoved', function (shipData) {
    if (self.ship) {
      // Store server state for reconciliation
      self.lastServerState = shipData;

      if (!self.player || !self.player.isControllingShip) {
        // Not controlling - accept server state with lerp
        const lerpFactor = 0.3;
        const newX = Phaser.Math.Linear(self.ship.x, shipData.x, lerpFactor);
        const newY = Phaser.Math.Linear(self.ship.y, shipData.y, lerpFactor);
        self.ship.setPosition(newX, newY);
        self.ship.setRotation(shipData.rotation);

        // Update velocity and physics state
        self.ship.currentSpeed = shipData.currentSpeed;
        self.ship.isAnchored = shipData.isAnchored;
        self.steeringDirection = shipData.steeringDirection;
      } else {
        // Controlling ship - reconcile with prediction
        // Remove acknowledged inputs
        if (shipData.lastProcessedInput) {
          self.pendingInputs = self.pendingInputs.filter(
            input => input.sequence > shipData.lastProcessedInput
          );
        }

        // Check for prediction error (mismatch between client and server)
        const POSITION_THRESHOLD = 5; // pixels
        const ROTATION_THRESHOLD = 0.1; // radians (~5.7 degrees)

        const posError = Math.sqrt(
          Math.pow(self.ship.x - shipData.x, 2) +
          Math.pow(self.ship.y - shipData.y, 2)
        );
        const rotError = Math.abs(self.ship.rotation - shipData.rotation);

        if (posError > POSITION_THRESHOLD || rotError > ROTATION_THRESHOLD) {
          // Significant mismatch - reconcile!
          console.log(`Reconciling: posError=${posError.toFixed(2)}, rotError=${rotError.toFixed(2)}`);

          // Step 1: Rewind to server state
          self.ship.setPosition(shipData.x, shipData.y);
          self.ship.setRotation(shipData.rotation);
          self.ship.currentSpeed = shipData.currentSpeed;
          self.steeringDirection = shipData.steeringDirection;

          // Step 2: Replay pending inputs to re-predict
          self.pendingInputs.forEach(input => {
            const newState = updateShipPhysics(
              {
                x: self.ship.x,
                y: self.ship.y,
                rotation: self.ship.rotation,
                steeringDirection: self.steeringDirection,
                currentSpeed: self.ship.currentSpeed,
                isAnchored: self.ship.isAnchored
              },
              {
                turnLeft: input.turnLeft,
                turnRight: input.turnRight
              },
              1/60, // Assume 60Hz for replay
              self.shipModifiers // Pass modifiers to physics
            );

            // Apply replayed state
            self.ship.setPosition(newState.x, newState.y);
            self.ship.setRotation(newState.rotation);
            self.ship.currentSpeed = newState.currentSpeed;
            self.steeringDirection = newState.steeringDirection;
          });

          console.log(`Reconciliation complete. Replayed ${self.pendingInputs.length} inputs.`);
        }
      }

      // Always sync non-physics properties
      if (shipData.isAnchored !== undefined) {
        self.ship.isAnchored = shipData.isAnchored;
      }
      if (shipData.targetSpeed !== undefined) {
        self.ship.targetSpeed = shipData.targetSpeed;
      }

      // Client-side prediction: Only sync cannon angles if NOT mounted on that specific cannon
      if (shipData.cannons) {
        // Update left cannon only if player is not mounted on it
        if (!self.player.isOnCannon || self.player.cannonSide !== 'left') {
          self.ship.cannons.left.relativeAngle = shipData.cannons.leftAngle || 0;
        }
        // Update right cannon only if player is not mounted on it
        if (!self.player.isOnCannon || self.player.cannonSide !== 'right') {
          self.ship.cannons.right.relativeAngle = shipData.cannons.rightAngle || 0;
        }
      }

      // Sync modifier state from server
      if (shipData.modifiers) {
        self.shipModifiers = shipData.modifiers;

        // Build shipModifiersArray from synced modifiers
        // (Note: order won't be preserved for mid-game joins, uses fixed order)
        self.shipModifiersArray = [];
        if (shipData.modifiers.speed) {
          self.shipModifiersArray.push({
            type: 'RIOS_WINDS',
            color: 0x00CED1,
            name: "Río de la Plata's Winds"
          });
        }
        if (shipData.modifiers.turning) {
          self.shipModifiersArray.push({
            type: 'CAPTAINS_WISDOM',
            color: 0xFFD700,
            name: "Captain's Wisdom"
          });
        }
        if (shipData.modifiers.fireRate) {
          self.shipModifiersArray.push({
            type: 'PIRATES_TENACITY',
            color: 0xDC143C,
            name: "Pirate's Tenacity"
          });
        }
        if (shipData.modifiers.abyssVision) {
          self.shipModifiersArray.push({
            type: 'ABYSS_LANTERN',
            color: 0x7A00FF,
            name: "Lantern of the Abyss"
          });
        }
      }
    }
  });

  // Handle ship destroyed event
  this.socket.on('shipDestroyed', function () {
    if (self.ship) {
      console.log('Ship destroyed');
      // Optional: cleanup, could respawn later
    }
  });

  this.socket.on('currentPlayers', function (players) {
    // Instead of destroying all players, update existing ones and remove only those who left
    const incomingPlayerIds = Object.keys(players)
      .filter(id => players[id].playerId !== self.socket.id)
      .map(id => players[id].playerId);

    // Remove only players who are no longer in the list
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (!incomingPlayerIds.includes(otherPlayer.playerId)) {
        otherPlayer.destroy();
      }
    });

    Object.keys(players).forEach(function (id) {
      if (players[id].playerId === self.socket.id) {
        // Update my player avatar (ship is handled separately by 'sharedShip' event)
        if (!self.player) {
          // Create player avatar if doesn't exist
          if (self.ship) {
            self.player = addPlayer(self, players[id].player, self.ship);
          }
        } else if (self.ship) {
          // Update player position (for room transition)
          self.player.setPosition(
            self.ship.x + players[id].player.x,
            self.ship.y + players[id].player.y
          );
        }
      } else {
        // Find existing player or create new one
        let otherPlayer = self.otherPlayers.getChildren().find(p => p.playerId === players[id].playerId);

        if (otherPlayer && self.ship) {
          // Update existing player - preserves animation state
          otherPlayer.setPosition(
            self.ship.x + players[id].player.x,
            self.ship.y + players[id].player.y
          );
          otherPlayer.setRotation(players[id].player.rotation);
          otherPlayer.roomX = players[id].roomX;
          otherPlayer.roomY = players[id].roomY;

          // Update depth based on crow's nest state
          if (players[id].player.isInCrowsNest) {
            otherPlayer.setDepth(4); // On top of crow's nest
          } else if (players[id].player.isOnCannon || players[id].player.isControllingShip) {
            otherPlayer.setDepth(3); // Normal depth
          } else {
            otherPlayer.setDepth(3); // Walking - under crow's nest
          }
        } else if (self.ship) {
          // Create new player
          otherPlayer = addOtherPlayer(self, players[id].player, self.ship);
          otherPlayer.playerId = players[id].playerId;
          otherPlayer.roomX = players[id].roomX;
          otherPlayer.roomY = players[id].roomY;

          // Initialize animation state from server-provided isMoving field
          const isMoving = players[id].player.isMoving || false;

          if (isMoving && !players[id].player.isControllingShip && !players[id].player.isOnCannon && !players[id].player.isInCrowsNest) {
            otherPlayer.play('run');
          } else {
            otherPlayer.setFrame('tile000.png');
          }

          // Set initial depth based on crow's nest state
          if (players[id].player.isInCrowsNest) {
            otherPlayer.setDepth(4); // On top of crow's nest
          } else {
            otherPlayer.setDepth(3); // Normal depth
          }

          self.otherPlayers.add(otherPlayer);
        }
      }
    });
  });

  this.socket.on('newPlayer', function (playerInfo) {
    // Don't create a player for ourselves
    if (playerInfo.playerId === self.socket.id) {
      return;
    }

    // Check if player already exists - don't create duplicates
    const existingPlayer = self.otherPlayers.getChildren().find(p => p.playerId === playerInfo.playerId);
    if (existingPlayer) {
      console.log(`Player ${playerInfo.playerId} already exists, skipping creation`);
      return;
    }

    // Create other player's avatar on the shared ship
    if (self.ship) {
      const otherPlayer = addOtherPlayer(self, playerInfo.player, self.ship);
      otherPlayer.playerId = playerInfo.playerId;
      otherPlayer.roomX = playerInfo.roomX;
      otherPlayer.roomY = playerInfo.roomY;

      // Initialize animation state from server-provided isMoving field
      const isMoving = playerInfo.player.isMoving || false;

      if (isMoving && !playerInfo.player.isControllingShip && !playerInfo.player.isOnCannon && !playerInfo.player.isInCrowsNest) {
        otherPlayer.play('run');
      } else {
        otherPlayer.setFrame('tile000.png');
      }

      // Set initial depth based on crow's nest state
      if (playerInfo.player.isInCrowsNest) {
        otherPlayer.setDepth(4); // On top of crow's nest
      } else {
        otherPlayer.setDepth(3); // Normal depth
      }

      self.otherPlayers.add(otherPlayer);
      console.log(`New player joined: ${playerInfo.playerId}`);
    }
  });

  this.socket.on('playerLeft', function (playerId) {
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (playerId === otherPlayer.playerId) {
        // Destroy player avatar only (ship is shared)
        otherPlayer.destroy();
        console.log(`Player left: ${playerId}`);
      }
    });
  });

  this.socket.on('playerMoved', function (playerInfo) {
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (playerInfo.playerId === otherPlayer.playerId) {
        // Update player avatar position (relative to shared ship)
        if (self.ship) {
          otherPlayer.setPosition(
            self.ship.x + playerInfo.player.x,
            self.ship.y + playerInfo.player.y
          );
          otherPlayer.setRotation(playerInfo.player.rotation);

          // Synchronize animation based on received isMoving state
          const isMoving = playerInfo.player.isMoving || false;

          if (isMoving && !playerInfo.player.isControllingShip && !playerInfo.player.isOnCannon && !playerInfo.player.isInCrowsNest) {
            // Player walking - play animation
            if (!otherPlayer.anims.isPlaying ||
                otherPlayer.anims.currentAnim.key !== 'run') {
              otherPlayer.play('run');
            }
          } else {
            // Player idle or at helm - stop animation
            if (otherPlayer.anims.isPlaying) {
              otherPlayer.stop();
              otherPlayer.setFrame('tile000.png');
            }
          }
        }
      }
    });
  });

  this.socket.on('newBullet', function (creationData) {
    console.log("self.ship", self.ship)
    console.log("self.ship.playerId", self.ship?.playerId)
    console.log("PRE ADD BULLET ", creationData)
    console.log("Received newBullet from:", creationData.shooterId, "My ID:", self.ship?.playerId);
    addBullet(self, creationData);
  });

  this.socket.on('playerIsDead', function (playerInfo, deathData) {
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (playerInfo.playerId === otherPlayer.playerId) {
        otherPlayer.setTexture(playerInfo.sprite);
        otherPlayer.setPosition(playerInfo.x, playerInfo.y);
        otherPlayer.setRotation(playerInfo.rotation);
      }
    });
  });

  // Handle room changes
  this.socket.on('roomChanged', function (roomData) {
    self.currentRoomX = roomData.roomX;
    self.currentRoomY = roomData.roomY;

    // Add to visited rooms
    const roomKey = `${roomData.roomX},${roomData.roomY}`;
    self.visitedRooms.add(roomKey);

    console.log(`Changed to room (${roomData.roomX}, ${roomData.roomY})`);
    console.log(`Visited rooms: ${self.visitedRooms.size}`);
  });

  // Handle modifiers in room
  this.socket.on('roomModifiers', function (modifiers) {
    // Clear existing modifiers
    self.modifiers.clear(true, true);

    // Create visual modifiers as floating bottles
    modifiers.forEach(function (modifierData, index) {
      // Create aura/glow effect behind the bottle (using modifier's color)
      const aura = self.add.circle(
        modifierData.x,
        modifierData.y,
        20, // Radius
        modifierData.color, // Use modifier's unique color
        0.3 // Alpha for subtle glow
      );

      // Pulse animation for the aura
      self.tweens.add({
        targets: aura,
        scale: 1.3,
        alpha: 0.15,
        duration: 1800 + (index * 100),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: index * 120
      });

      const modifier = self.add.sprite(
        modifierData.x,
        modifierData.y,
        'potionModifier'
      );

      // Apply tint based on modifier color from server
      modifier.setTint(modifierData.color);

      // Add floating bobbing animation
      self.tweens.add({
        targets: [modifier, aura],
        y: modifierData.y + 8, // Float up and down 8 pixels
        duration: 1500 + (index * 200), // Slightly different duration for each
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1, // Infinite loop
        delay: index * 100 // Stagger the start times
      });

      // Add subtle rotation for floating effect
      self.tweens.add({
        targets: modifier,
        angle: 10,
        duration: 2000 + (index * 150),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: index * 150
      });

      // Store aura reference with modifier for cleanup
      modifier.aura = aura;
      modifier.modifierId = modifierData.id;
      modifier.modifierType = modifierData.type;
      modifier.isAbyssal = modifierData.isAbyssal || false; // Track if this is an abyssal modifier

      // Set initial visibility based on current world state
      const hasAbyssVision = self.shipModifiers && self.shipModifiers.abyssVision;
      const inAbyssalWorld = hasAbyssVision && self.lanternLit;

      // Abyssal items: visible only in abyssal world
      // Normal items: visible only in normal world
      const shouldBeVisible = modifier.isAbyssal ? inAbyssalWorld : !inAbyssalWorld;
      modifier.setVisible(shouldBeVisible);
      modifier.aura.setVisible(shouldBeVisible);

      self.modifiers.add(modifier);
      self.modifiers.add(aura); // Add aura to group so it gets cleared too
    });

    console.log(`Spawned ${modifiers.length} modifiers in room`);
  });

  // Handle portal position for Abyssal Compass
  this.socket.on('portalPosition', function (portal) {
    self.portalRoomX = portal.roomX;
    self.portalRoomY = portal.roomY;
    console.log(`Portal located at room (${portal.roomX}, ${portal.roomY})`);
  });

  // Handle modifier collection
  this.socket.on('modifierCollected', function (data) {
    // Find the modifier to get its position before destroying
    let modifierPosition = null;
    self.modifiers.getChildren().forEach(function (modifier) {
      if (modifier.modifierId === data.modifierId) {
        modifierPosition = { x: modifier.x, y: modifier.y };

        // Destroy the aura first if it exists
        if (modifier.aura) {
          modifier.aura.destroy();
        }
        modifier.destroy();
      }
    });

    // Update local ship modifiers state
    self.shipModifiers = data.shipModifiers;

    // Add to modifiers array (for HUD display in order)
    // Only add if not already in array (avoid duplicates)
    const existingIndex = self.shipModifiersArray.findIndex(m => m.type === data.modifierType);
    if (existingIndex === -1) {
      self.shipModifiersArray.push({
        type: data.modifierType,
        color: data.modifierColor,
        name: data.modifierName
      });
    }

    // Play sound based on item type (usesCurseSound field determines sound)
    const soundKey = data.usesCurseSound ? 'curse' : 'blessing';
    const itemSound = self.sound.add(soundKey, { volume: 1.0 });
    itemSound.play();

    // Fade out over 6 seconds
    self.tweens.add({
      targets: itemSound,
      volume: 0,
      duration: 6000,
      onComplete: function() {
        itemSound.stop();
        itemSound.destroy();
      }
    });

    // Show floating text with modifier name and lore (always show, regardless of modifierPosition)
    // The text is positioned relative to the ship, not the modifier
    if (data.modifierName && data.modifierLore) {
      const posX = modifierPosition ? modifierPosition.x : self.ship.x;
      const posY = modifierPosition ? modifierPosition.y : self.ship.y;
      showModifierPickupText(self, posX, posY, data.modifierName, data.modifierLore, data.modifierColor);
    }

    // If Abyss Lantern was collected and lantern is currently lit, update lantern visual to violet
    if (data.modifierType === 'ABYSS_LANTERN' && self.lanternLit && self.lantern) {
      updateLanternVisual(self.lantern, self.lanternLit, true);
    }

    console.log(`Collected "${data.modifierName}" modifier!`);
  });

  // Handle chat messages
  this.socket.on('playerSentMessage', function (messageData) {
    // If it's my own message, show it above my player
    if (messageData.playerId === self.socket.id) {
      showChatBubble(self, self.player, messageData.message);
      return;
    }

    // Find the player who sent the message (all players are on the same ship now)
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (messageData.playerId === otherPlayer.playerId) {
        showChatBubble(self, otherPlayer, messageData.message);
      }
    });
  });

  // Listen for day/night cycle updates from server
  this.socket.on('timeUpdate', function (timeData) {
    self.gameTime = {
      currentTime: timeData.currentTime,
      timeRatio: timeData.timeRatio,
      cycleLength: timeData.cycleLength
    };
  });

  // Listen for lantern toggle on shared ship
  this.socket.on('lanternToggled', function (data) {
    // Update lantern state on shared ship
    if (self.lanternLit !== data.lanternLit) {
      self.lanternLit = data.lanternLit;
      // Update the visual state
      if (self.lantern) {
        updateLanternVisual(self.lantern, self.lanternLit, self.shipModifiers.abyssVision);
      }
    }
  });

}

////////////////////////////////////////// UPDATE

// Definir variables de cooldown
let canShootLeft = true;
let canShootRight = true;
const cooldownTime = 3000;
let leftCannonLastShot = 0;
let rightCannonLastShot = 0;

// Show floating text when collecting a modifier (Dark Souls style)
function showModifierPickupText(scene, x, y, name, lore, color) {
  // Position text centered over the ship (not over the modifier pickup location)
  // This ensures text is always centered regardless of ship rotation
  const shipX = scene.ship.x;
  const shipY = scene.ship.y;

  // Convert hex color (0x00CED1) to CSS string (#00CED1)
  const cssColor = '#' + color.toString(16).padStart(6, '0');

  // Create main title text (centered above ship)
  const titleText = scene.add.text(shipX, shipY - 120, name, {
    fontSize: '20px',
    fontFamily: 'Georgia, serif',
    fill: cssColor,    // Use modifier's unique color
    stroke: '#000000',
    strokeThickness: 4,
    align: 'center',
    shadow: {
      offsetX: 2,
      offsetY: 2,
      color: '#000000',
      blur: 4,
      fill: true
    }
  }).setOrigin(0.5).setDepth(1000);

  // Create lore text (centered above ship)
  const loreText = scene.add.text(shipX, shipY - 90, lore, {
    fontSize: '14px',
    fontFamily: 'Georgia, serif',
    fill: '#B0B0B0',    // Warm gray - contemplative/memory feeling
    stroke: '#000000',
    strokeThickness: 3,
    align: 'center',
    wordWrap: { width: 400 },
    shadow: {
      offsetX: 1,
      offsetY: 1,
      color: '#000000',
      blur: 3,
      fill: true
    }
  }).setOrigin(0.5).setDepth(1000);

  // Store offset data for updating position (fixed offset from ship center)
  titleText.shipOffsetX = 0; // Always centered on ship
  titleText.shipOffsetY = -120;
  loreText.shipOffsetX = 0; // Always centered on ship
  loreText.shipOffsetY = -90;

  // Track floating offset for animation
  titleText.floatingOffset = 0;
  loreText.floatingOffset = 0;

  // Add to scene's floating texts list for position updates
  if (!scene.floatingTexts) {
    scene.floatingTexts = [];
  }
  scene.floatingTexts.push({ title: titleText, lore: loreText });

  // Fade in and float up animation
  titleText.setAlpha(0);
  loreText.setAlpha(0);

  scene.tweens.add({
    targets: titleText,
    alpha: 1,
    floatingOffset: -20,
    duration: 800,
    ease: 'Sine.easeOut'
  });

  scene.tweens.add({
    targets: loreText,
    alpha: 1,
    floatingOffset: -20,
    duration: 800,
    ease: 'Sine.easeOut'
  });

  // Hold for a moment, then fade out
  scene.time.delayedCall(3500, () => {
    scene.tweens.add({
      targets: titleText,
      alpha: 0,
      floatingOffset: -50,
      duration: 1500,
      ease: 'Sine.easeIn'
    });

    scene.tweens.add({
      targets: loreText,
      alpha: 0,
      floatingOffset: -50,
      duration: 1500,
      ease: 'Sine.easeIn',
      onComplete: () => {
        titleText.destroy();
        loreText.destroy();
        // Remove from floating texts list
        scene.floatingTexts = scene.floatingTexts.filter(ft => ft.title !== titleText);
      }
    });
  });
}

function update(time, delta) {
  const deltaTime = delta / 1000; // Convertir a segundos

  if (this.ship && this.player) {

    // ===== INPUT =====
    const inputEnabled = !this.chatMode;
    const inputState = this.inputSystem.getInputState(inputEnabled);

    // Legacy input object for compatibility with old functions
    const input = {
      keyW: this.inputSystem.keys.W,
      keyA: this.inputSystem.keys.A,
      keyS: this.inputSystem.keys.S,
      keyD: this.inputSystem.keys.D,
      keyE: this.inputSystem.keys.E,
      keyLeft: this.inputSystem.keys.LEFT,
      keyRight: this.inputSystem.keys.RIGHT,
      keyPlus: this.inputSystem.keys.PLUS,
      keyMinus: this.inputSystem.keys.MINUS,
      keyM: this.inputSystem.keys.M,
      keySpace: this.inputSystem.keys.SPACE
    };

    // Toggle mapa con M, o cerrar con ESC
    if (inputState.map) {
      this.mapVisible = !this.mapVisible;
      console.log(`Map ${this.mapVisible ? 'shown' : 'hidden'}`);

      // Reset map viewport when closing the map
      if (!this.mapVisible) {
        const uiScene = this.scene.get('UIScene');
        if (uiScene) {
          uiScene.mapViewOffsetX = 0;
          uiScene.mapViewOffsetY = 0;
        }
      }
    }

    // Close map with ESC (only close, don't open)
    if (Phaser.Input.Keyboard.JustDown(this.inputSystem.keys.ESC) && this.mapVisible) {
      this.mapVisible = false;
      console.log('Map hidden (ESC)');

      // Reset map viewport when closing the map
      const uiScene = this.scene.get('UIScene');
      if (uiScene) {
        uiScene.mapViewOffsetX = 0;
        uiScene.mapViewOffsetY = 0;
      }
    }

    // Block ALL game input when map is open
    if (this.mapVisible) {
      // Block arrow keys from controlling cannons/aim
      if (inputState.aim) {
        inputState.aim.left = false;
        inputState.aim.right = false;
      }
      // Block player movement (WASD)
      if (inputState.movement) {
        inputState.movement.up = false;
        inputState.movement.down = false;
        inputState.movement.left = false;
        inputState.movement.right = false;
      }
      // Block steering (A/D)
      if (inputState.steering) {
        inputState.steering.left = false;
        inputState.steering.right = false;
      }
      // Block other actions
      inputState.interact = false;
      inputState.fire = false;
    }

    // ===== SISTEMA DE ZOOM AUTOMÁTICO =====
    // Automatic zoom based on player role
    let targetZoomByRole;
    if (this.player.isInCrowsNest) {
      // In crow's nest - zoomed out for far visibility
      targetZoomByRole = 0.5;
    } else if (this.player.isControllingShip || this.player.isOnCannon) {
      // Controlling ship or on cannon - medium zoom
      targetZoomByRole = 1.0;
    } else {
      // On foot - close zoom
      targetZoomByRole = 1.5;
    }

    this.targetZoom = targetZoomByRole;

    // Aplicar zoom suave
    if (this.targetZoom === undefined) {
      this.targetZoom = this.currentZoom;
    }
    if (this.currentZoom !== this.targetZoom) {
      this.currentZoom = Phaser.Math.Linear(this.currentZoom, this.targetZoom, 0.1);
      this.cameras.main.setZoom(this.currentZoom);
    }

    // ===== SISTEMA DE FAROL =====
    // Update lantern position to follow ship
    updateLanternPosition(this.lantern, this.ship);

    // ===== FLOATING MODIFIER TEXTS =====
    // Update floating text positions to follow ship
    if (this.floatingTexts && this.floatingTexts.length > 0) {
      this.floatingTexts.forEach(ft => {
        if (ft.title && ft.title.active) {
          ft.title.setPosition(
            this.ship.x + ft.title.shipOffsetX,
            this.ship.y + ft.title.shipOffsetY + ft.title.floatingOffset
          );
        }
        if (ft.lore && ft.lore.active) {
          ft.lore.setPosition(
            this.ship.x + ft.lore.shipOffsetX,
            this.ship.y + ft.lore.shipOffsetY + ft.lore.floatingOffset
          );
        }
      });
    }

    // Check if player is near lantern (center of ship)
    const canUseLantern = isNearLantern(this.player, this.ship);

    // Lantern indicator
    if (!this.lanternIndicator) {
      this.lanternIndicator = this.add.text(0, 0, '', {
        fontSize: '12px',
        fill: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 5, y: 3 }
      }).setDepth(10).setOrigin(0.5);
    }

    if (canUseLantern && !this.player.isControllingShip) {
      // Check if ship has Abyss Lantern modifier
      const hasAbyssLantern = this.shipModifiers && this.shipModifiers.abyssVision;
      const lanternName = hasAbyssLantern ? 'farol del abismo' : 'farol';
      const lanternText = this.lanternLit
        ? `Presiona E para apagar ${lanternName}`
        : `Presiona E para prender ${lanternName}`;
      this.lanternIndicator.setText(lanternText);
      this.lanternIndicator.setPosition(this.ship.x, this.ship.y - 30);
      this.lanternIndicator.setVisible(true);
    } else {
      this.lanternIndicator.setVisible(false);
    }

    // Toggle lantern with E
    if (inputEnabled && inputState.interact && canUseLantern && !this.player.isControllingShip) {
      // Toggle local state
      this.lanternLit = !this.lanternLit;

      // Update lantern visual
      updateLanternVisual(this.lantern, this.lanternLit, this.shipModifiers.abyssVision);

      // Play lantern sound with fade out
      const lanternSound = this.sound.add(this.lanternLit ? 'lanternLight' : 'lanternExtinguish');
      lanternSound.setVolume(0.3);
      lanternSound.play();

      // Fade out after 1 second (duration: 500ms)
      this.time.delayedCall(1000, () => {
        this.tweens.add({
          targets: lanternSound,
          volume: 0,
          duration: 1000,
          onComplete: () => lanternSound.stop()
        });
      });

      // Emit to server
      this.socket.emit('toggleLantern');
    }

    // ===== SISTEMA DE TIMÓN (usando HelmSystem) =====
    this.helmSystem.update(this.player, this.ship, inputState.interact && inputEnabled);
    const canUseHelm = this.helmSystem.isNearHelm(this.player, this.ship);

    // ===== SISTEMA DE ANCLA (usando AnchorSystem) =====
    this.anchorSystem.update(this.player, this.ship, inputState.interact && inputEnabled, canUseHelm);
    const canUseAnchor = this.anchorSystem.isNearAnchor(this.player, this.ship);

    // ===== SISTEMA DE COFA (usando CrowsNestSystem) =====
    this.crowsNestSystem.update(this.player, this.ship, inputState.interact && inputEnabled, canUseHelm, canUseAnchor);

    // ===== SISTEMA DE CAÑONES (usando CannonSystem) =====
    if (this.ship.cannons) {
      this.cannonSystem.update(
        this.player,
        this.ship,
        this.ship.cannons,
        inputState,
        deltaTime,
        time,
        canUseHelm,
        canUseAnchor,
        this.shipModifiers // Pass modifiers for fire rate
      );
    }

    // ===== ACTUALIZAR PLAYER (usa shipFunctions y playerFunctions) =====
    updatePlayer(this, this.player, this.ship, input, deltaTime, inputEnabled);

    // ===== ACTUALIZAR SHIP (client-side prediction with shared physics) =====
    if (this.player.isControllingShip && inputEnabled) {
      // Client prediction: run the same physics as server

      this.ship.previousRotation = this.ship.rotation;

      const shipInput = {
        turnLeft: inputState.steering.left,
        turnRight: inputState.steering.right
      };

      // Buffer this input
      this.inputSequence++;
      const inputPacket = {
        sequence: this.inputSequence,
        turnLeft: shipInput.turnLeft,
        turnRight: shipInput.turnRight,
        timestamp: Date.now()
      };
      this.pendingInputs.push(inputPacket);

      // Limit buffer size (safety)
      if (this.pendingInputs.length > 100) {
        this.pendingInputs.shift();
      }

      // Run prediction using shared physics
      const newState = updateShipPhysics(
        {
          x: this.ship.x,
          y: this.ship.y,
          rotation: this.ship.rotation,
          steeringDirection: this.steeringDirection,
          currentSpeed: this.ship.currentSpeed,
          isAnchored: this.ship.isAnchored
        },
        shipInput,
        deltaTime,
        this.shipModifiers // Pass modifiers to physics
      );

      // Apply predicted state
      this.ship.setPosition(newState.x, newState.y);
      this.ship.setRotation(newState.rotation);
      this.ship.setVelocity(newState.velocityX, newState.velocityY);
      this.ship.currentSpeed = newState.currentSpeed;
      this.steeringDirection = newState.steeringDirection;

      // Send input to server
      this.socket.emit('shipInput', {
        sequence: this.inputSequence,
        isControlling: true,
        steering: {
          left: shipInput.turnLeft,
          right: shipInput.turnRight
        },
        anchor: this.ship.isAnchored,
        cannons: {
          leftAngle: this.ship.cannons ? this.ship.cannons.left.relativeAngle : 0,
          rightAngle: this.ship.cannons ? this.ship.cannons.right.relativeAngle : 0
        }
      });
    } else {

    // Enviar rotación de cañones si el jugador está montado en uno
    if (this.player.isOnCannon && this.ship.cannons) {
      this.socket.emit('cannonRotation', {
        leftAngle: this.ship.cannons.left.relativeAngle,
        rightAngle: this.ship.cannons.right.relativeAngle
      });
    }

   this.ship.previousRotation = this.ship.rotation;

   // Not controlling - still use shared physics but with no input
   const newState = updateShipPhysics(
     {
       x: this.ship.x,
       y: this.ship.y,
       rotation: this.ship.rotation,
       steeringDirection: this.steeringDirection,
       currentSpeed: this.ship.currentSpeed,
       isAnchored: this.ship.isAnchored
     },
     { turnLeft: false, turnRight: false }, // No input
     deltaTime,
     this.shipModifiers // Pass modifiers to physics
   );

   // Apply state
   this.ship.setPosition(newState.x, newState.y);
   this.ship.setRotation(newState.rotation);
   this.ship.setVelocity(newState.velocityX, newState.velocityY);
   this.ship.currentSpeed = newState.currentSpeed;
   this.steeringDirection = newState.steeringDirection;
 }
    // ===== ACTUALIZAR EMISORES DE ESTELA =====
    updateShipWakeEmitters(this.ship);
    // Note: Only one shared ship, so only one wake emitter

    // ===== UPDATE LIGHT MASK =====
    // Calculate darkness factor based on time of day
    if (this.gameTime) {
      const timeRatio = this.gameTime.timeRatio;
      let darknessFactor;
      if (timeRatio < 0.25) {
        // Deep night (0.0-0.25)
        darknessFactor = 1.0 - (timeRatio / 0.25) * 0.1; // 1.0 → 0.9
      } else if (timeRatio < 0.5) {
        // Sunrise to noon (0.25-0.5)
        darknessFactor = 0.9 - ((timeRatio - 0.25) / 0.25) * 0.9; // 0.9 → 0.0
      } else if (timeRatio < 0.75) {
        // Noon to sunset (0.5-0.75)
        darknessFactor = ((timeRatio - 0.5) / 0.25) * 0.5; // 0.0 → 0.5
      } else {
        // Sunset to night (0.75-1.0)
        darknessFactor = 0.5 + ((timeRatio - 0.75) / 0.25) * 0.45; // 0.5 → 0.95
      }

      // Collect positions of all lit lanterns
      const lanternPositions = [];

      // Add own ship's lantern if lit
      if (this.lanternLit && this.ship) {
        // Convert world coordinates to screen coordinates (account for zoom origin at camera center)
        const zoom = this.cameras.main.zoom;
        const cam = this.cameras.main;
        const camX = (this.ship.x - cam.scrollX) * zoom + cam.width / 2 * (1 - zoom);
        const camY = (this.ship.y - cam.scrollY) * zoom + cam.height / 2 * (1 - zoom);
        lanternPositions.push({ x: camX, y: camY });
      }

      // Note: All players share the same ship, so only one lantern exists

      // Update the light mask in UIScene
      const uiScene = this.scene.get('UIScene');
      if (uiScene && uiScene.updateLightMask) {
        uiScene.updateLightMask(lanternPositions, darknessFactor);
      }
    }

    // ===== UPDATE ABYSSAL MODIFIER VISIBILITY =====
    // Toggle between normal world and abyssal world based on lantern state
    const hasAbyssVision = this.shipModifiers && this.shipModifiers.abyssVision;
    const inAbyssalWorld = hasAbyssVision && this.lanternLit;

    this.modifiers.getChildren().forEach(function (modifier) {
      if (modifier.isAbyssal !== undefined) {
        // Abyssal items: only visible in abyssal world (lantern + abyss vision)
        // Normal items: only visible in normal world (no abyss vision OR lantern off)
        const shouldBeVisible = modifier.isAbyssal ? inAbyssalWorld : !inAbyssalWorld;

        modifier.setVisible(shouldBeVisible);
        if (modifier.aura) {
          modifier.aura.setVisible(shouldBeVisible);
        }
      }
    });

    // ===== ACTUALIZAR POSICIONES DE BURBUJAS DE CHAT =====
    // Actualizar burbujas del jugador local
    if (this.player) {
      updateChatBubblePosition(this.player);
    }

    // Actualizar burbujas de otros jugadores
    this.otherPlayers.getChildren().forEach(function (otherPlayer) {
      updateChatBubblePosition(otherPlayer);
    });

    // Calcular posición relativa del jugador al barco
    const playerRelativeX = this.player.x - this.ship.x;
    const playerRelativeY = this.player.y - this.ship.y;

    // Calcular si el jugador está en movimiento (para sincronizar animaciones)
    const isPlayerMoving = inputEnabled &&
                          !this.player.isControllingShip &&
                          !this.player.isOnCannon &&
                          (input.keyW.isDown || input.keyS.isDown ||
                           input.keyA.isDown || input.keyD.isDown);

    // Emitir movimiento
    const x = this.ship.x;
    const y = this.ship.y;
    const r = this.ship.rotation;

    // Network optimization: check if steering/cannon values changed significantly
    const currentSteeringDirection = this.steeringDirection;
    const currentCannonLeft = this.ship.cannons ? this.ship.cannons.left.relativeAngle : 0;
    const currentCannonRight = this.ship.cannons ? this.ship.cannons.right.relativeAngle : 0;

    const STEERING_THRESHOLD = 2; // Only send if changed by more than 2 units
    const CANNON_THRESHOLD = 0.03; // ~1.7 degrees
    const NETWORK_THROTTLE_MS = 50; // Minimum 50ms between steering/cannon updates

    const steeringChanged = Math.abs(currentSteeringDirection - this.lastSentSteeringDirection) > STEERING_THRESHOLD;
    const cannonLeftChanged = Math.abs(currentCannonLeft - this.lastSentCannonLeft) > CANNON_THRESHOLD;
    const cannonRightChanged = Math.abs(currentCannonRight - this.lastSentCannonRight) > CANNON_THRESHOLD;
    const isMovingChanged = isPlayerMoving !== this.lastSentIsMoving; // Detect animation state change
    const throttleTimeElapsed = (time - this.lastNetworkSendTime) > NETWORK_THROTTLE_MS;

    const shouldSendSteeringOrCannon = (steeringChanged || cannonLeftChanged || cannonRightChanged) && throttleTimeElapsed;

    // Emitir si es el primer frame O si algo cambió (incluyendo isMoving para animaciones)
    if (!this.ship.oldPosition ||
        x !== this.ship.oldPosition.x ||
        y !== this.ship.oldPosition.y ||
        r !== this.ship.oldPosition.rotation ||
        playerRelativeX !== this.ship.oldPosition.playerX ||
        playerRelativeY !== this.ship.oldPosition.playerY ||
        this.player.rotation !== this.ship.oldPosition.playerRotation ||
        isMovingChanged ||
        shouldSendSteeringOrCannon) {

      this.socket.emit('playerMovement', {
        ship: {
          x: this.ship.x,
          y: this.ship.y,
          rotation: this.ship.rotation,
          velocityX: this.ship.body.velocity.x,
          velocityY: this.ship.body.velocity.y,
          isAnchored: this.ship.isAnchored,           // Critical for particles sync
          currentSpeed: this.ship.currentSpeed,       // Critical for particles intensity
          targetSpeed: this.ship.targetSpeed,         // Critical for navigation level
          steeringDirection: currentSteeringDirection,  // Ship steering wheel position
          cannons: {
            leftAngle: currentCannonLeft,
            rightAngle: currentCannonRight
          }
        },
        player: {
          x: playerRelativeX,
          y: playerRelativeY,
          rotation: this.player.rotation,
          isControllingShip: this.player.isControllingShip,
          isOnCannon: this.player.isOnCannon,
          cannonSide: this.player.cannonSide,
          isInCrowsNest: this.player.isInCrowsNest,
          isMoving: isPlayerMoving,  // Animation sync
          velocityX: this.player.body.velocity.x,
          velocityY: this.player.body.velocity.y
        }
      });

      // Update last sent isMoving state (always update when sent)
      this.lastSentIsMoving = isPlayerMoving;

      // Update last sent values if they were sent due to significant change
      if (shouldSendSteeringOrCannon) {
        this.lastSentSteeringDirection = currentSteeringDirection;
        this.lastSentCannonLeft = currentCannonLeft;
        this.lastSentCannonRight = currentCannonRight;
        this.lastNetworkSendTime = time;
      }
    }

    // Guardar datos de la posición anterior
    this.ship.oldPosition = {
      x: this.ship.x,
      y: this.ship.y,
      rotation: this.ship.rotation,
      playerX: playerRelativeX,
      playerY: playerRelativeY,
      playerRotation: this.player.rotation
    };

    // ===== ROOM TRANSITION LOGIC =====
    // Check if ship crossed world boundaries
    let newRoomX = this.currentRoomX;
    let newRoomY = this.currentRoomY;
    let newShipX = this.ship.x;
    let newShipY = this.ship.y;
    let shouldChangeRoom = false;

    // Debug: log position every 60 frames (~1 second)
    if (!this.debugFrameCount) this.debugFrameCount = 0;
    this.debugFrameCount++;
    if (this.debugFrameCount % 60 === 0) {
      console.log(`Ship position: (${Math.floor(this.ship.x)}, ${Math.floor(this.ship.y)})`);
    }

    // Check right boundary
    if (this.ship.x > WORLD_WIDTH) {
      console.log(`CROSSED RIGHT BOUNDARY: ${this.ship.x} > ${WORLD_WIDTH}`);
      newRoomX = this.currentRoomX + 1;
      newShipX = 0;
      shouldChangeRoom = true;
    }
    // Check left boundary
    else if (this.ship.x < 0) {
      console.log(`CROSSED LEFT BOUNDARY: ${this.ship.x} < 0`);
      newRoomX = this.currentRoomX - 1;
      newShipX = WORLD_WIDTH;
      shouldChangeRoom = true;
    }

    // Check bottom boundary
    if (this.ship.y > WORLD_HEIGHT) {
      console.log(`CROSSED BOTTOM BOUNDARY: ${this.ship.y} > ${WORLD_HEIGHT}`);
      newRoomY = this.currentRoomY + 1;
      newShipY = 0;
      shouldChangeRoom = true;
    }
    // Check top boundary
    else if (this.ship.y < 0) {
      console.log(`CROSSED TOP BOUNDARY: ${this.ship.y} < 0`);
      newRoomY = this.currentRoomY - 1;
      newShipY = WORLD_HEIGHT;
      shouldChangeRoom = true;
    }

    if (shouldChangeRoom) {
      console.log(`Transitioning from room (${this.currentRoomX}, ${this.currentRoomY}) to (${newRoomX}, ${newRoomY})`);

      // Update ship position locally for smooth transition
      this.ship.setPosition(newShipX, newShipY);
      this.player.setPosition(
        newShipX + playerRelativeX,
        newShipY + playerRelativeY
      );

      // Notify server about room change
      this.socket.emit('changeRoom', {
        roomX: newRoomX,
        roomY: newRoomY,
        shipX: newShipX,
        shipY: newShipY
      });

      // Note: currentRoomX/Y will be updated by the 'roomChanged' event from server
    }
  }
}

/////////////////////////////////////////////////////////////////////////////////////////

// Escena de "UI" para manejar elementos de interfaz de usuario
class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {

    // Obtén una referencia a la escena principal (MainScene)
    this.mainScene = this.scene.get('MainScene');

    // Track time for light breathing effect
    this.breathingTime = 0;

    // Map viewport offset (for exploring map with arrow keys)
    this.mapViewOffsetX = 0;
    this.mapViewOffsetY = 0;
    this.mapScrollTimer = 0; // Throttle timer for smooth scrolling

    // Obtén las coordenadas de la cámara del jugador
    const cameraX = this.mainScene.cameras.main.width / 2;
    const cameraY = this.mainScene.cameras.main.height / 2;

    // Day/Night overlay - covers entire screen with tint
    const screenWidth = this.mainScene.cameras.main.width;
    const screenHeight = this.mainScene.cameras.main.height;

    this.dayNightOverlay = this.add.rectangle(
      cameraX,
      cameraY,
      screenWidth,
      screenHeight,
      0x050510, // Very dark blue/purple night color
      0
    );
    this.dayNightOverlay.setScrollFactor(0);
    this.dayNightOverlay.setDepth(1);

    // Light mask - RenderTexture that will define where light reveals the scene
    // This will be used as a bitmap mask on the overlay
    this.lightMask = this.add.renderTexture(0, 0, screenWidth, screenHeight);
    this.lightMask.setScrollFactor(0); // Keep in screen/camera coordinates
    this.lightMask.setVisible(false); // Hide the RenderTexture itself (only use as mask source)

    // Apply bitmap mask to the overlay
    // Where the mask is drawn white (light sources), the overlay will be hidden
    const bitmapMask = this.lightMask.createBitmapMask();
    bitmapMask.invertAlpha = true; // Invert: white in mask = transparent in overlay
    this.dayNightOverlay.setMask(bitmapMask);

    // Abyss Lantern overlay - violet tint when modifier is active
    // This creates the "seeing through the abyss" effect
    this.abyssOverlay = this.add.rectangle(
      cameraX,
      cameraY,
      screenWidth,
      screenHeight,
      0x7A00FF, // Bright violet (same as Abyss Lantern color)
      0.45 // Start with visible alpha for testing
    );
    this.abyssOverlay.setScrollFactor(0);
    this.abyssOverlay.setDepth(10000); // Extremely high depth
    this.abyssOverlay.setBlendMode(Phaser.BlendModes.NORMAL);
    this.abyssOverlay.setAlpha(0); // Start invisible, will be controlled in update
    console.log("Abyss overlay created at depth:", this.abyssOverlay.depth);

    // Indicador de timón - Barra horizontal minimalista
    const helmBarWidth = 425; // Ancho de la barra (con margen de 50px en cada lado)
    const helmBarY = cameraY + 350; // Posición en el viewport
    const markerHeight = 30; // Altura del marcador vertical principal
    const centerMarkerHeight = 20; // Altura del marcador central (más corto)

    // Barra base horizontal (fija)
    this.steeringBar = this.add.graphics();
    this.steeringBar.lineStyle(3, 0xffffff, 0.7);
    this.steeringBar.lineBetween(-helmBarWidth / 2, 0, helmBarWidth / 2, 0);
    this.steeringBar.setPosition(cameraX, helmBarY);
    this.steeringBar.setScrollFactor(0);
    this.steeringBar.setDepth(100);
    this.steeringBar.setVisible(false); // Inicialmente invisible

    // Marcador vertical (se desliza)
    this.steeringMarker = this.add.graphics();
    this.steeringMarker.lineStyle(5, 0xffffff, 0.85);
    this.steeringMarker.lineBetween(0, -markerHeight / 2, 0, markerHeight / 2);
    this.steeringMarker.setPosition(cameraX, helmBarY);
    this.steeringMarker.setScrollFactor(0);
    this.steeringMarker.setDepth(101);
    this.steeringMarker.setVisible(false); // Inicialmente invisible

    // Marcador central (fijo, como referencia)
    this.steeringCenterMarker = this.add.graphics();
    this.steeringCenterMarker.lineStyle(4, 0xffffff, 0.5);
    this.steeringCenterMarker.lineBetween(0, -centerMarkerHeight / 2, 0, centerMarkerHeight / 2);
    this.steeringCenterMarker.setPosition(cameraX, helmBarY);
    this.steeringCenterMarker.setScrollFactor(0);
    this.steeringCenterMarker.setDepth(100);
    this.steeringCenterMarker.setVisible(false); // Inicialmente invisible

    // ===== MAPA =====
    const mapSize = 9; // 9x9 grid
    const cellSize = 40;
    const mapWidth = mapSize * cellSize;
    const mapHeight = mapSize * cellSize;
    const mapX = cameraX - mapWidth / 2;
    const mapY = cameraY - mapHeight / 2;

    // Contenedor del mapa
    this.mapContainer = this.add.container(0, 0);
    this.mapContainer.setScrollFactor(0);
    this.mapContainer.setDepth(2000);

    // Fondo del mapa
    this.mapBackground = this.add.rectangle(cameraX, cameraY, mapWidth + 40, mapHeight + 80, 0x000000, 0.9);
    this.mapBackground.setScrollFactor(0);
    this.mapBackground.setDepth(1999);

    // Título del mapa
    this.mapTitle = this.add.text(cameraX, mapY - 20, 'MAPA (M)', {
      fontSize: '14px',
      fill: '#ffffff',
      fontStyle: 'bold'
    }).setScrollFactor(0).setDepth(2001).setOrigin(0.5);

    // Coordenadas del jugador
    this.mapCoordinates = this.add.text(cameraX, mapY + mapHeight + 20, 'X: 0, Y: 0', {
      fontSize: '14px',
      fill: '#00ff00',
      fontStyle: 'bold'
    }).setScrollFactor(0).setDepth(2001).setOrigin(0.5);

    // Grid de celdas (9x9 = 81 celdas)
    this.mapCells = [];
    for (let row = 0; row < mapSize; row++) {
      for (let col = 0; col < mapSize; col++) {
        const cellX = mapX + col * cellSize + cellSize / 2;
        const cellY = mapY + row * cellSize + cellSize / 2;

        // Crear celda
        const cell = this.add.rectangle(cellX, cellY, cellSize - 2, cellSize - 2, 0x222222);
        cell.setScrollFactor(0);
        cell.setDepth(2000);
        cell.setStrokeStyle(1, 0x444444);

        this.mapCells.push({
          rect: cell,
          row: row,
          col: col
        });
      }
    }

    // Indicador del jugador (triángulo rojo usando Graphics para mejor control)
    this.playerIndicator = this.add.graphics();
    this.playerIndicator.setScrollFactor(0);
    this.playerIndicator.setDepth(2002);
    this.playerIndicator.setVisible(false);

    // Dibujar triángulo centrado en (0, 0)
    this.playerIndicator.fillStyle(0xFF0000, 1);
    this.playerIndicator.fillTriangle(
      0, -5,    // Punto superior (arriba)
      -4, 4,    // Punto inferior izquierdo
      4, 4      // Punto inferior derecho
    );

    // Indicador del portal (cuadrado violeta rotando para simular portal)
    this.portalIndicator = this.add.graphics();
    this.portalIndicator.setScrollFactor(0);
    this.portalIndicator.setDepth(2001);
    this.portalIndicator.setVisible(false);

    // Dibujar cuadrado violeta centrado en (0, 0)
    this.portalIndicator.fillStyle(0x7A00FF, 1); // Violet
    this.portalIndicator.fillRect(-6, -6, 12, 12);

    // Variable para animación de rotación del portal
    this.portalRotation = 0;

    // Inicialmente oculto
    this.mapBackground.setVisible(false);
    this.mapTitle.setVisible(false);
    this.mapCoordinates.setVisible(false);
    this.mapCells.forEach(cell => cell.rect.setVisible(false));

    // ===== CHAT INPUT =====
    // Estado del chat
    this.chatActive = false;
    this.chatMessage = '';

    // Fondo del input de chat
    this.chatInputBg = this.add.rectangle(cameraX, cameraY - 100, 400, 30, 0x000000, 0.8);
    this.chatInputBg.setScrollFactor(0);
    this.chatInputBg.setDepth(2010);
    this.chatInputBg.setVisible(false);

    // Texto del input de chat
    this.chatInputText = this.add.text(cameraX - 190, cameraY - 100, '', {
      fontSize: '14px',
      fill: '#ffffff'
    });
    this.chatInputText.setScrollFactor(0);
    this.chatInputText.setDepth(2011);
    this.chatInputText.setOrigin(0, 0.5);
    this.chatInputText.setVisible(false);

    // Contador de caracteres
    this.chatCounter = this.add.text(cameraX + 180, cameraY - 100, '0/50', {
      fontSize: '11px',
      fill: '#888888'
    });
    this.chatCounter.setScrollFactor(0);
    this.chatCounter.setDepth(2011);
    this.chatCounter.setOrigin(1, 0.5);
    this.chatCounter.setVisible(false);

    // ===== MODIFIER INDICATORS (Square Cells with Colored Circles) =====
    const modifierCellSize = 50; // Outer cell size
    const modifierCellSpacing = 10; // Space between cells
    const modifierCellStartX = cameraX - 380; // Left side of screen
    const modifierCellStartY = cameraY - 350; // Top of screen

    // Helper function to create a single cell (outer border, inner white square, colored circle)
    const createModifierCell = (x, y) => {
      const container = this.add.container(x, y);
      container.setScrollFactor(0);
      container.setDepth(2020);

      // Outer cell with white border (initially transparent background)
      const outerCell = this.add.rectangle(0, 0, modifierCellSize, modifierCellSize, 0x000000, 0);
      outerCell.setStrokeStyle(2, 0xFFFFFF, 1); // White border

      // Inner white square (slightly smaller)
      const innerSquareSize = modifierCellSize * 0.6; // 60% of cell size
      const innerSquare = this.add.rectangle(0, 0, innerSquareSize, innerSquareSize, 0xFFFFFF, 1);

      // Colored circle (will be updated based on modifier)
      const circleRadius = innerSquareSize * 0.4; // 40% of inner square
      const coloredCircle = this.add.circle(0, 0, circleRadius, 0xFFFFFF, 1);

      container.add([outerCell, innerSquare, coloredCircle]);
      container.setVisible(false);

      // Store references for updating
      container.coloredCircle = coloredCircle;

      return container;
    };

    // Create 9 cells for up to 9 modifiers
    this.modifierCells = [];
    for (let i = 0; i < 9; i++) {
      const cell = createModifierCell(
        modifierCellStartX + i * (modifierCellSize + modifierCellSpacing),
        modifierCellStartY
      );
      this.modifierCells.push(cell);
    }

    // Registrar teclas una sola vez
    this.keyT = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyBackspace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE);

    // Capturar input de teclado para chat
    this.input.keyboard.on('keydown', (event) => {
      if (!this.chatActive) return;

      const key = event.key;

      // Borrar con Backspace
      if (key === 'Backspace') {
        this.chatMessage = this.chatMessage.slice(0, -1);
      }
      // Capturar caracteres imprimibles (longitud 1)
      else if (key.length === 1 && this.chatMessage.length < 50) {
        this.chatMessage += key;
      }

      // Actualizar el texto mostrado con ventana deslizante
      const displayText = this.chatMessage.length > 30
        ? '...' + this.chatMessage.substring(this.chatMessage.length - 27)
        : this.chatMessage;
      this.chatInputText.setText(displayText + '|');
      this.chatCounter.setText(this.chatMessage.length + '/50');

      // Cambiar color si se acerca al límite
      if (this.chatMessage.length >= 90) {
        this.chatCounter.setStyle({ fill: '#ff0000' });
      } else {
        this.chatCounter.setStyle({ fill: '#888888' });
      }
    });
  }

  // Update the light mask to draw circles where lanterns illuminate
  updateLightMask(lanternPositions, darknessFactor) {
    if (!this.lightMask) return;

    // Clear previous mask (fills with transparent black)
    this.lightMask.clear();

    // Calculate effective light radius based on darkness
    // Use world units (independent of camera zoom) and convert to screen pixels
    // Ship is 178px wide, so 350px world units covers ship + buffer nicely
    const baseRadiusWorldUnits = 450; // World-space radius at night
    const minRadiusWorldUnits = 400;  // World-space radius during day
    const worldRadius = minRadiusWorldUnits + (baseRadiusWorldUnits - minRadiusWorldUnits) * darknessFactor;

    // Convert world units to screen pixels based on camera zoom
    const mainZoom = this.mainScene.cameras.main.zoom;

    // Add breathing oscillation (pulsing effect)
    const breathingSpeed = 2000; // Milliseconds per cycle (lower = faster)
    const breathingAmount = 0.05; // 5% variation in size
    const breathingFactor = 1 + (Math.sin(this.breathingTime / breathingSpeed * Math.PI * 2) * breathingAmount);

    const effectiveRadius = (worldRadius * breathingFactor) * mainZoom;

    // Create a temporary Graphics object to draw circles
    const graphics = this.add.graphics();

    // If Abyss Lantern modifier is active AND lantern is lit, illuminate entire map (night vision effect)
    const hasAbyssLantern = this.mainScene.shipModifiers && this.mainScene.shipModifiers.abyssVision;
    if (hasAbyssLantern && lanternPositions.length > 0) {
      graphics.fillStyle(0xffffff, 1.0);
      // Draw huge circle to reveal everything (night vision effect)
      const nightVisionRadiusWorld = 10000; // Extra large radius for full map coverage
      const nightVisionRadius = nightVisionRadiusWorld * mainZoom;
      graphics.fillCircle(
        this.mainScene.cameras.main.width / 2,
        this.mainScene.cameras.main.height / 2,
        nightVisionRadius
      );
      // Draw the graphics onto the RenderTexture
      this.lightMask.draw(graphics, 0, 0);
      graphics.destroy();
      return;
    }

    // If it's very bright (low darkness), draw a huge circle to reveal almost everything
    if (darknessFactor < 0.1) {
      graphics.fillStyle(0xffffff, 1.0);
      // Scale day radius by zoom to maintain world-space coverage
      const dayRadiusWorld = 5000;
      const dayRadius = dayRadiusWorld * mainZoom;
      graphics.fillCircle(
        this.mainScene.cameras.main.width / 2,
        this.mainScene.cameras.main.height / 2,
        dayRadius
      );
      // Draw the graphics onto the RenderTexture
      this.lightMask.draw(graphics, 0, 0);
      graphics.destroy();
      return;
    }

    // Draw light circles for each lantern
    lanternPositions.forEach(pos => {
      // Core light circle (sharp edge)
      graphics.fillStyle(0xffffff, 1.0);
      graphics.fillCircle(pos.x, pos.y, effectiveRadius);

      // Blur effect - draw concentric circles with decreasing alpha
      const blurSteps = 4;
      const blurWidthWorld = 60; // Total blur width in world units
      const blurWidth = blurWidthWorld * mainZoom; // Convert to screen pixels
      for (let i = 1; i <= blurSteps; i++) {
        const alpha = 1.0 - (i / blurSteps);
        const radius = effectiveRadius + (blurWidth * i / blurSteps);
        graphics.fillStyle(0xffffff, alpha);
        graphics.fillCircle(pos.x, pos.y, radius);
      }
    });

    // Draw the graphics onto the RenderTexture
    this.lightMask.draw(graphics, 0, 0);

    // Destroy the temporary graphics object
    graphics.destroy();
  }

  update(time, delta) {
    // Update breathing time for light pulsing effect
    this.breathingTime += delta;

    // ===== ACTUALIZAR DÍA/NOCHE =====
    if (this.mainScene.gameTime && this.dayNightOverlay) {
      const timeRatio = this.mainScene.gameTime.timeRatio;

      // Calculate color and alpha based on time of day
      // timeRatio: 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset, 1=midnight
      let color, alpha;

      if (timeRatio < 0.25) {
        // Night to Sunrise (0.0 - 0.25)
        const t = timeRatio / 0.25; // 0 to 1
        color = this.interpolateColor(0x050510, 0xFFCC88, t);
        alpha = 0.95 - (t * 0.65); // 0.95 to 0.3
      } else if (timeRatio < 0.5) {
        // Sunrise to Noon (0.25 - 0.5)
        const t = (timeRatio - 0.25) / 0.25; // 0 to 1
        color = this.interpolateColor(0xFFCC88, 0xFFFFFF, t);
        alpha = 0.3 - (t * 0.3); // 0.3 to 0.0
      } else if (timeRatio < 0.75) {
        // Noon to Sunset (0.5 - 0.75)
        const t = (timeRatio - 0.5) / 0.25; // 0 to 1
        color = this.interpolateColor(0xFFFFFF, 0xFF8844, t);
        alpha = t * 0.35; // 0.0 to 0.35
      } else {
        // Sunset to Night (0.75 - 1.0)
        const t = (timeRatio - 0.75) / 0.25; // 0 to 1
        color = this.interpolateColor(0xFF8844, 0x050510, t);
        alpha = 0.35 + (t * 0.6); // 0.35 to 0.95
      }

      this.dayNightOverlay.setFillStyle(color, alpha);
    }

    // ===== ACTUALIZAR ABYSS LANTERN OVERLAY =====
    // Show violet overlay when Abyss Lantern modifier is active and lantern is lit
    if (this.abyssOverlay) {
      const hasAbyssLantern = this.mainScene.shipModifiers && this.mainScene.shipModifiers.abyssVision;
      const lanternLit = this.mainScene.lanternLit;

      if (hasAbyssLantern && lanternLit) {
        // Show violet overlay with strong alpha (same visibility day and night)
        this.abyssOverlay.setAlpha(0.5);
        this.abyssOverlay.setFillStyle(0x7A00FF, 1.0);
        console.log("Abyss overlay ACTIVE - alpha:", this.abyssOverlay.alpha, "visible:", this.abyssOverlay.visible, "depth:", this.abyssOverlay.depth);
      } else {
        // Hide overlay
        this.abyssOverlay.setAlpha(0);
      }
    }

    // ===== CONTROL DE VIEWPORT DEL MAPA =====
    // CRITICAL: ONLY process arrow keys when map is EXPLICITLY visible
    const mapVisible = this.mainScene && this.mainScene.mapVisible;

    // Initialize scroll speed throttle if not exists
    if (!this.mapScrollTimer) {
      this.mapScrollTimer = 0;
    }

    // ABSOLUTELY DO NOT allow viewport changes unless map is visible
    if (!mapVisible) {
      // Map is NOT visible - FORCE reset offset and timer IMMEDIATELY
      this.mapViewOffsetX = 0;
      this.mapViewOffsetY = 0;
      this.mapScrollTimer = 0;
    } else if (mapVisible === true && this.mainScene.inputSystem) {
      // Map IS visible - allow viewport control
      const keys = this.mainScene.inputSystem.keys;

      // Throttle scroll speed (update every 150ms for smooth but not too fast scrolling)
      this.mapScrollTimer += delta;
      const canScroll = this.mapScrollTimer >= 150;

      if (canScroll) {
        // Mover viewport del mapa con las flechas HOLD (isDown para mantener presionado)
        if (keys.UP.isDown) {
          this.mapViewOffsetY -= 1;
          this.mapScrollTimer = 0;
        }
        if (keys.DOWN.isDown) {
          this.mapViewOffsetY += 1;
          this.mapScrollTimer = 0;
        }
        if (keys.LEFT.isDown) {
          this.mapViewOffsetX -= 1;
          this.mapScrollTimer = 0;
        }
        if (keys.RIGHT.isDown) {
          this.mapViewOffsetX += 1;
          this.mapScrollTimer = 0;
        }
      }
    }

    // ===== ACTUALIZAR MAPA =====

    // Mostrar/ocultar elementos del mapa
    this.mapBackground.setVisible(mapVisible);
    this.mapTitle.setVisible(mapVisible);
    this.mapCoordinates.setVisible(mapVisible);

    if (mapVisible) {
      const currentRoomX = this.mainScene.currentRoomX;
      const currentRoomY = this.mainScene.currentRoomY;
      const visitedRooms = this.mainScene.visitedRooms;

      // Actualizar texto de coordenadas
      this.mapCoordinates.setText(`X: ${currentRoomX}, Y: ${currentRoomY}`);

      // Grid es 9x9, centrado en room actual + offset del viewport
      const halfSize = 4; // (9-1)/2

      this.mapCells.forEach(cell => {
        cell.rect.setVisible(true);

        // Calcular coordenadas de room para esta celda (aplicar offset del viewport)
        const roomX = currentRoomX + (cell.col - halfSize) + this.mapViewOffsetX;
        const roomY = currentRoomY + (cell.row - halfSize) + this.mapViewOffsetY;
        const roomKey = `${roomX},${roomY}`;

        // Determinar color según estado
        let color;
        if (roomX === currentRoomX && roomY === currentRoomY) {
          // Room actual - azul
          color = 0x1E90FF;
        } else if (visitedRooms.has(roomKey)) {
          // Room visitado - azul
          color = 0x1E90FF;
        } else {
          // Room no visitado - gris muy oscuro
          color = 0x000000;
        }

        cell.rect.setFillStyle(color);
      });

      // ===== ACTUALIZAR INDICADOR DEL JUGADOR =====
      if (this.mainScene.ship) {
        const mapSize = 9;
        const cellSize = 40;
        const mapWidth = mapSize * cellSize;
        const mapHeight = mapSize * cellSize;
        const cameraX = this.mainScene.cameras.main.width / 2;
        const cameraY = this.mainScene.cameras.main.height / 2;
        const mapX = cameraX - mapWidth / 2;
        const mapY = cameraY - mapHeight / 2;

        // Calcular en qué celda está el jugador considerando el offset del viewport
        // La celda del jugador se desplaza en dirección opuesta al offset del viewport
        const playerCol = 4 - this.mapViewOffsetX;
        const playerRow = 4 - this.mapViewOffsetY;

        // Solo mostrar indicador si el jugador está visible en el grid actual
        const isPlayerVisible = playerCol >= 0 && playerCol < mapSize &&
                                 playerRow >= 0 && playerRow < mapSize;

        if (isPlayerVisible) {
          const cellCenterX = mapX + playerCol * cellSize + cellSize / 2;
          const cellCenterY = mapY + playerRow * cellSize + cellSize / 2;

          // Mapear posición del barco (0-3200) a offset dentro de celda (-19 a +19 pixels)
          const WORLD_WIDTH = 3200;
          const WORLD_HEIGHT = 3200;
          const playerOffsetX = ((this.mainScene.ship.x / WORLD_WIDTH) - 0.5) * (cellSize - 2);
          const playerOffsetY = ((this.mainScene.ship.y / WORLD_HEIGHT) - 0.5) * (cellSize - 2);

          // Posición final del indicador
          const indicatorX = cellCenterX + playerOffsetX;
          const indicatorY = cellCenterY + playerOffsetY;

          // Actualizar posición y rotación
          this.playerIndicator.setPosition(indicatorX, indicatorY);
          this.playerIndicator.setRotation(this.mainScene.ship.rotation);
          this.playerIndicator.setVisible(true);
        } else {
          // Jugador fuera del viewport del mapa
          this.playerIndicator.setVisible(false);
        }
      } else {
        this.playerIndicator.setVisible(false);
      }

      // ===== ACTUALIZAR INDICADOR DEL PORTAL (ABYSSAL COMPASS) =====
      // Only show portal indicator if player has the compass
      const hasCompass = this.mainScene.shipModifiers && this.mainScene.shipModifiers.compass;
      if (hasCompass && this.mainScene.portalRoomX !== undefined && this.mainScene.portalRoomY !== undefined) {
        const mapSize = 9;
        const cellSize = 40;
        const mapWidth = mapSize * cellSize;
        const mapHeight = mapSize * cellSize;
        const cameraX = this.mainScene.cameras.main.width / 2;
        const cameraY = this.mainScene.cameras.main.height / 2;
        const mapX = cameraX - mapWidth / 2;
        const mapY = cameraY - mapHeight / 2;

        // Calculate portal position on map considering viewport offset
        const currentRoomX = this.mainScene.currentRoomX;
        const currentRoomY = this.mainScene.currentRoomY;
        const portalRoomX = this.mainScene.portalRoomX;
        const portalRoomY = this.mainScene.portalRoomY;

        // Calculate relative position with offset
        const portalCol = 4 + (portalRoomX - currentRoomX) - this.mapViewOffsetX;
        const portalRow = 4 + (portalRoomY - currentRoomY) - this.mapViewOffsetY;

        // Check if portal is visible in current map viewport
        const isPortalVisible = portalCol >= 0 && portalCol < mapSize &&
                                portalRow >= 0 && portalRow < mapSize;

        if (isPortalVisible) {
          const cellCenterX = mapX + portalCol * cellSize + cellSize / 2;
          const cellCenterY = mapY + portalRow * cellSize + cellSize / 2;

          // Update portal rotation animation (rotate continuously)
          this.portalRotation += 0.03; // Rotation speed

          // Update portal indicator position and rotation
          this.portalIndicator.setPosition(cellCenterX, cellCenterY);
          this.portalIndicator.setRotation(this.portalRotation);
          this.portalIndicator.setVisible(true);
        } else {
          this.portalIndicator.setVisible(false);
        }
      } else {
        this.portalIndicator.setVisible(false);
      }
    } else {
      this.mapCells.forEach(cell => cell.rect.setVisible(false));
      this.playerIndicator.setVisible(false);
      this.portalIndicator.setVisible(false);
    }

    // Actualizar estado del jugador
    if (this.mainScene.player) {
      if (this.mainScene.player.isControllingShip) {
        this.steeringBar.setVisible(true);
        this.steeringMarker.setVisible(true);
        this.steeringCenterMarker.setVisible(true);

        // Mover el marcador horizontalmente según la dirección
        // steeringDirection: -45 a +45 → markerOffset: -100 a +100
        const markerOffsetX = (this.mainScene.steeringDirection / 45) * 100;
        const cameraX = this.mainScene.cameras.main.width / 2;
        const helmBarY = this.mainScene.cameras.main.height / 2 + 350;
        this.steeringMarker.setPosition(cameraX + markerOffsetX, helmBarY);
      } else {
        this.steeringBar.setVisible(false);
        this.steeringMarker.setVisible(false);
        this.steeringCenterMarker.setVisible(false);
      }
    }

    // ===== MANEJAR CHAT INPUT =====
    // Usar referencias de teclas registradas en create
    const keyT = this.keyT;
    const keyEnter = this.keyEnter;
    const keyEsc = this.keyEsc;
    const keyBackspace = this.keyBackspace;

    if (Phaser.Input.Keyboard.JustDown(keyT) && !this.chatActive) {
      // Activar chat
      this.chatActive = true;
      this.chatMessage = '';
      this.chatInputBg.setVisible(true);
      this.chatInputText.setVisible(true);
      this.chatCounter.setVisible(true);

      // Limpiar el texto mostrado
      this.chatInputText.setText('|');
      this.chatCounter.setText('0/50');
      this.chatCounter.setStyle({ fill: '#888888' });

      // Desactivar controles del juego
      if (this.mainScene) {
        this.mainScene.chatMode = true;
      }
    }

    if (this.chatActive) {
      // Enviar mensaje con Enter
      if (Phaser.Input.Keyboard.JustDown(keyEnter)) {
        if (this.chatMessage.trim().length > 0) {
          sendChatMessage(this.mainScene, this.chatMessage);
        }
        this.chatActive = false;
        this.chatMessage = '';
        this.chatInputBg.setVisible(false);
        this.chatInputText.setVisible(false);
        this.chatCounter.setVisible(false);

        // Reactivar controles del juego
        if (this.mainScene) {
          this.mainScene.chatMode = false;
        }
      }

      // Cancelar con Escape
      if (Phaser.Input.Keyboard.JustDown(keyEsc)) {
        this.chatActive = false;
        this.chatMessage = '';
        this.chatInputBg.setVisible(false);
        this.chatInputText.setVisible(false);
        this.chatCounter.setVisible(false);

        // Reactivar controles del juego
        if (this.mainScene) {
          this.mainScene.chatMode = false;
        }
      }
    }

    // ===== UPDATE MODIFIER INDICATORS =====
    // Update cells based on shipModifiersArray (shows items in order collected)
    if (this.mainScene.shipModifiersArray) {
      const modifiers = this.mainScene.shipModifiersArray;

      // Update each cell
      for (let i = 0; i < this.modifierCells.length; i++) {
        const cell = this.modifierCells[i];

        if (i < modifiers.length) {
          // Show cell and update color
          cell.setVisible(true);
          cell.coloredCircle.setFillStyle(modifiers[i].color, 1);
        } else {
          // Hide empty cells
          cell.setVisible(false);
        }
      }
    }
  }

  // Helper function to interpolate between two hex colors
  interpolateColor(color1, color2, t) {
    // Extract RGB components
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;

    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;

    // Interpolate
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    // Combine back to hex
    return (r << 16) | (g << 8) | b;
  }

}