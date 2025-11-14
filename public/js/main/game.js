// World configuration
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 3200;
const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 1600;

// Zoom configuration
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.5;

const SCREEN_WIDTH = WORLD_WIDTH;
const SCREEN_HEIGHT = WORLD_HEIGHT;

// Maximum distance to render players from adjacent rooms (in pixels)
const MAX_RENDER_DISTANCE = 2000;

// Helper function to calculate adjusted coordinates for cross-room rendering
function getAdjustedCoordinates(playerInfo, myRoomX, myRoomY) {
  const roomDiffX = playerInfo.roomX - myRoomX;
  const roomDiffY = playerInfo.roomY - myRoomY;

  return {
    x: playerInfo.ship.x + (roomDiffX * WORLD_WIDTH),
    y: playerInfo.ship.y + (roomDiffY * WORLD_HEIGHT),
    offsetX: roomDiffX * WORLD_WIDTH,
    offsetY: roomDiffY * WORLD_HEIGHT
  };
}

// Helper function to check if player should be rendered based on distance
function shouldRenderPlayer(adjustedX, adjustedY, myX, myY) {
  const distance = Phaser.Math.Distance.Between(myX, myY, adjustedX, adjustedY);
  return distance <= MAX_RENDER_DISTANCE;
}

var config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.ENVELOP,
    parent: 'phaser-example',
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT
  },
  // parent: 'phaser-example',
  // width: 800,
  // height: 600,
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

// console.log("IS MOBILE? ", navigator.userAgentData.mobile); //resolves true/false)

var game = new Phaser.Game(config);

function preload() {
  this.load.image('ship', 'assets/ship.png');
  this.load.image('player', 'assets/player.png');
  this.load.image('otherPlayer', 'assets/ship.png');

  this.load.audio('enterGame', ['sounds/portalenter.ogg', 'sounds/portalenter.mp3']);

  this.load.image('bullet', 'assets/bullet.png');
  this.load.image('cannon', 'assets/cannon.png');

  this.load.audio('shoot', 'sounds/bow5.mp3');

  // Anchor sounds
  this.load.audio('anchorDrop', 'sounds/anchor-chain-drop.wav');
  this.load.audio('anchorRise', 'sounds/anchor-chain-rising.mp3');

  // Lantern sounds
  this.load.audio('lanternLight', 'sounds/light-fire.wav');
  this.load.audio('lanternExtinguish', 'sounds/extinguish-fire.wav');

  this.load.image('playerMuerto', 'assets/player_muerto.png');

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

  // Day/Night cycle - synchronized from server
  this.gameTime = {
    currentTime: 0,
    timeRatio: 0.5, // Start at noon
    cycleLength: 5 * 60 * 1000
  };

  // Crear una escena de "UI" que se superpondrá a la escena principal
  self.scene.add('UIScene', UIScene, true);

  // Groups
  this.otherPlayers = this.physics.add.group(); // Renamed: now stores other player avatars
  this.otherBullets = this.physics.add.group();

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
      self.ship.cannons = createCannons(self, self.ship);
      updateCannonPosition(self.ship.cannons.left, self.ship, 'left');
      updateCannonPosition(self.ship.cannons.right, self.ship, 'right');

      // Create lantern at ship center
      self.lanternLit = false;
      self.lantern = createLantern(self, self.ship, self.lanternLit);

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
      // Update shared ship from server (only if not controlling it yourself)
      // This prevents jitter from server updates overriding local physics
      if (!self.player || !self.player.isControllingShip) {
        // Smooth interpolation for position (lerp towards target)
        const lerpFactor = 0.3; // Adjust for smoothness (0.1=slow, 0.5=fast)
        const targetX = shipData.x;
        const targetY = shipData.y;
        const targetRot = shipData.rotation;

        // Lerp position for smooth movement
        const newX = Phaser.Math.Linear(self.ship.x, targetX, lerpFactor);
        const newY = Phaser.Math.Linear(self.ship.y, targetY, lerpFactor);
        self.ship.setPosition(newX, newY);

        // Don't lerp rotation - let angular velocity handle it
        // Rotation is controlled by physics (setAngularVelocity in updateShip)
        // Lerping rotation would override angular velocity and slow down turns
      }

      // Always sync critical properties (even if you're controlling - for consistency)
      if (shipData.isAnchored !== undefined) {
        self.ship.isAnchored = shipData.isAnchored;
      }
      if (shipData.currentSpeed !== undefined) {
        self.ship.currentSpeed = shipData.currentSpeed;
      }
      if (shipData.targetSpeed !== undefined) {
        self.ship.targetSpeed = shipData.targetSpeed;
      }
      if (shipData.steeringDirection !== undefined) {
        self.steeringDirection = shipData.steeringDirection;
      }

      // Always sync non-physics data
      if (shipData.cannons) {
        self.ship.cannons.left.relativeAngle = shipData.cannons.leftAngle || 0;
        self.ship.cannons.right.relativeAngle = shipData.cannons.rightAngle || 0;
        updateCannonPosition(self.ship.cannons.left, self.ship, 'left');
        updateCannonPosition(self.ship.cannons.right, self.ship, 'right');
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
    // Clear all existing other players when receiving fresh player list (e.g., room change)
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      otherPlayer.destroy();
    });
    self.otherPlayers.clear(true, true);

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
        // Create other players' avatars (they share the same ship)
        if (self.ship) {
          const otherPlayer = addOtherPlayer(self, players[id].player, self.ship);
          otherPlayer.playerId = players[id].playerId;
          otherPlayer.roomX = players[id].roomX;
          otherPlayer.roomY = players[id].roomY;

          // Initialize animation state
          const playerVelX = players[id].player.velocityX || 0;
          const playerVelY = players[id].player.velocityY || 0;
          const playerSpeed = Math.sqrt(playerVelX * playerVelX + playerVelY * playerVelY);
          const isMoving = playerSpeed > 10;

          if (isMoving && !players[id].player.isControllingShip) {
            otherPlayer.play('run');
          } else {
            otherPlayer.setFrame('tile000.png');
          }

          self.otherPlayers.add(otherPlayer);
        }
      }
    });
  });

  this.socket.on('newPlayer', function (playerInfo) {
    // Create other player's avatar on the shared ship
    if (self.ship) {
      const otherPlayer = addOtherPlayer(self, playerInfo.player, self.ship);
      otherPlayer.playerId = playerInfo.playerId;
      otherPlayer.roomX = playerInfo.roomX;
      otherPlayer.roomY = playerInfo.roomY;

      // Initialize animation state
      const playerVelX = playerInfo.player.velocityX || 0;
      const playerVelY = playerInfo.player.velocityY || 0;
      const playerSpeed = Math.sqrt(playerVelX * playerVelX + playerVelY * playerVelY);
      const isMoving = playerSpeed > 10;

      if (isMoving && !playerInfo.player.isControllingShip) {
        otherPlayer.play('run');
      } else {
        otherPlayer.setFrame('tile000.png');
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

          if (isMoving && !playerInfo.player.isControllingShip && !playerInfo.player.isOnCannon) {
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

  // Handle chat messages
  this.socket.on('playerSentMessage', function (messageData) {
    const MAX_CHAT_DISTANCE = 550; // Max distance to see messages

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
        updateLanternVisual(self.lantern, self.lanternLit);
      }
    }
  });

}

////////////////////////////////////////// UPDATE

// Configuración de parámetros
const accelerationRateForward = 0.001;  // Tasa de aumento de aceleración al ir hacia adelante
const accelerationRateReverse = 0.01;   // Tasa de aumento de aceleración al ir en reversa

const maxSpeedForward = 150;  // Velocidad máxima al ir hacia adelante
const maxSpeedReverse = 200;  // Velocidad máxima al ir en reversa
let acceleration = 0;
let turnSpeed = 50;
const friction = 0.99; // Factor de fricción para simular pérdida gradual de velocidad

let isDrifting = false;  // Variable para rastrear si el jugador está realizando un drift
const driftFactor = 0.8;  // Factor de deriva para reducir la velocidad durante el drift

// Variables de control
let steeringDirection = 0; // Rango de -100 a 100
const maxSteeringDirection = 100;
const steeringIncrement = 1; // Ajusta la sensibilidad del timón
// Variables para el bloqueo de dirección
let maxLeftSteering = 0;
let maxRightSteering = 0;
// Nivel de navegación
let navigationLevel = 2; // 1: frenado, 2: nivel medio, 3: máxima velocidad

// Variable para el estado del ancla
let isAnchored = false;
let targetSpeed = 0;

let triggerShootLeft = false;
let triggerShootRight = false;

// Definir variables de cooldown
let canShootLeft = true;
let canShootRight = true;
const cooldownTime = 3000;
let leftCannonLastShot = 0;
let rightCannonLastShot = 0;

function update(time, delta) {
  const deltaTime = delta / 1000; // Convertir a segundos

  if (this.ship && this.player) {

    // ===== INPUT =====
    const input = {
      keyW: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      keyA: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      keyS: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      keyD: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      keyE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      keyLeft: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      keyRight: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      keyPlus: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
      keyMinus: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
      keyM: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M),
      keySpace: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    };

    // Guardar estado de JustDown para E (solo se puede llamar una vez por frame)
    const keyEJustPressed = Phaser.Input.Keyboard.JustDown(input.keyE);

    // Si el chat está activo, deshabilitar solo el input del jugador (no el update completo)
    const inputEnabled = !this.chatMode;

    // Toggle mapa con M
    if (inputEnabled && Phaser.Input.Keyboard.JustDown(input.keyM)) {
      this.mapVisible = !this.mapVisible;
      console.log(`Map ${this.mapVisible ? 'shown' : 'hidden'}`);
    }

    // ===== SISTEMA DE ZOOM =====
    // Zoom con teclas +/- (cada tap hace un cambio mayor)
    if (inputEnabled && Phaser.Input.Keyboard.JustDown(input.keyPlus)) {
      this.targetZoom = Math.min(ZOOM_MAX, this.currentZoom + ZOOM_STEP);
    }
    if (inputEnabled && Phaser.Input.Keyboard.JustDown(input.keyMinus)) {
      this.targetZoom = Math.max(ZOOM_MIN, this.currentZoom - ZOOM_STEP);
    }

    // Zoom con rueda del mouse
    if (inputEnabled) {
      this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        if (deltaY > 0) {
          this.targetZoom = Math.max(ZOOM_MIN, this.currentZoom - ZOOM_STEP);
        } else if (deltaY < 0) {
          this.targetZoom = Math.min(ZOOM_MAX, this.currentZoom + ZOOM_STEP);
        }
      });
    }

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
      const lanternText = this.lanternLit ? 'Presiona E para apagar farol' : 'Presiona E para prender farol';
      this.lanternIndicator.setText(lanternText);
      this.lanternIndicator.setPosition(this.ship.x, this.ship.y - 30);
      this.lanternIndicator.setVisible(true);
    } else {
      this.lanternIndicator.setVisible(false);
    }

    // Toggle lantern with E
    if (inputEnabled && keyEJustPressed && canUseLantern && !this.player.isControllingShip) {
      // Toggle local state
      this.lanternLit = !this.lanternLit;

      // Update lantern visual
      updateLanternVisual(this.lantern, this.lanternLit);

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

    // ===== SISTEMA DE TIMÓN =====
    const helmOffset = 125;
    const angle = this.ship.rotation - Math.PI / 2;
    const helmX = this.ship.x - Math.cos(angle) * helmOffset;
    const helmY = this.ship.y - Math.sin(angle) * helmOffset;

    const distanceToHelm = Phaser.Math.Distance.Between(this.player.x, this.player.y, helmX, helmY);
    const canUseHelm = distanceToHelm < 15;

    // Indicador de timón
    if (!this.helmIndicator) {
      this.helmIndicator = this.add.text(0, 0, 'Presiona E para manejar', {
        fontSize: '12px',
        fill: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 5, y: 3 }
      }).setDepth(10).setOrigin(0.5);
    }

    if (canUseHelm && !this.player.isControllingShip) {
      this.helmIndicator.setPosition(helmX, helmY - 20);
      this.helmIndicator.setVisible(true);
    } else {
      this.helmIndicator.setVisible(false);
    }

    // Toggle timón con E
    if (inputEnabled && keyEJustPressed && canUseHelm) {
      this.player.isControllingShip = !this.player.isControllingShip;

      // Cambiar cámara
      if (this.player.isControllingShip) {
        this.cameras.main.startFollow(this.ship, 1, 1);
      } else {
        this.cameras.main.startFollow(this.player, 1, 1);
      }
    }

    // ===== SISTEMA DE ANCLA =====
    const anchorOffset = 115;
    const anchorAngle = this.ship.rotation - Math.PI / 2;
    const anchorX = this.ship.x + Math.cos(anchorAngle) * anchorOffset;
    const anchorY = this.ship.y + Math.sin(anchorAngle) * anchorOffset;

    const distanceToAnchor = Phaser.Math.Distance.Between(this.player.x, this.player.y, anchorX, anchorY);
    const canUseAnchor = distanceToAnchor < 15;

    // Indicador de ancla
    if (!this.anchorIndicator) {
      this.anchorIndicator = this.add.text(0, 0, '', {
        fontSize: '12px',
        fill: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 5, y: 3 }
      }).setDepth(10).setOrigin(0.5);
    }

    // Actualizar texto del indicador según estado del ancla
    const anchorText = this.ship.isAnchored ? 'Presiona E para levantar ancla' : 'Presiona E para bajar ancla';
    this.anchorIndicator.setText(anchorText);

    if (canUseAnchor) {
      this.anchorIndicator.setPosition(anchorX, anchorY - 20);
      this.anchorIndicator.setVisible(true);
    } else {
      this.anchorIndicator.setVisible(false);
    }

    // Toggle ancla con E (solo si NO estás cerca del timón para evitar conflictos)
    if (inputEnabled && keyEJustPressed && canUseAnchor && !canUseHelm) {
      this.ship.isAnchored = !this.ship.isAnchored;

      // Play anchor sound with fade out
      const anchorSound = this.sound.add(this.ship.isAnchored ? 'anchorDrop' : 'anchorRise');
      anchorSound.setVolume(0.2);
      anchorSound.play();

      // Fade out after 2 seconds (duration: 800ms)
      this.time.delayedCall(2000, () => {
        this.tweens.add({
          targets: anchorSound,
          volume: 0,
          duration: 1400,
          onComplete: () => anchorSound.stop()
        });
      });

      if (!this.ship.isAnchored) {
        const currentSpeed = Math.sqrt(this.ship.body.velocity.x ** 2 + this.ship.body.velocity.y ** 2);
        this.ship.targetSpeed = currentSpeed;
      }
    }

    // ===== SISTEMA DE CAÑONES =====
    // Actualizar posición de los cañones
    if (this.ship.cannons) {
      updateCannonPosition(this.ship.cannons.left, this.ship, 'left');
      updateCannonPosition(this.ship.cannons.right, this.ship, 'right');
    }

    // Verificar proximidad a los cañones
    const canUseLeftCannon = isNearCannon(this.player, this.ship.cannons.left);
    const canUseRightCannon = isNearCannon(this.player, this.ship.cannons.right);

    // Indicador de cañón (único indicador para ambos cañones)
    if (!this.cannonIndicator) {
      this.cannonIndicator = this.add.text(0, 0, '', {
        fontSize: '12px',
        fill: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 5, y: 3 }
      }).setDepth(10).setOrigin(0.5);
    }

    // Mostrar indicador según el estado
    if (this.player.isOnCannon) {
      // Montado en cañón: mostrar cooldown solo si está recargando
      const isLeftCannon = this.player.cannonSide === 'left';
      const canShoot = isLeftCannon ? canShootLeft : canShootRight;
      const currentCannon = isLeftCannon ? this.ship.cannons.left : this.ship.cannons.right;

      if (!canShoot) {
        const lastShot = isLeftCannon ? leftCannonLastShot : rightCannonLastShot;
        const timeRemaining = Math.ceil((cooldownTime - (time - lastShot)) / 1000);
        this.cannonIndicator.setText(`Recargando... (${timeRemaining}s)`);
        this.cannonIndicator.setPosition(currentCannon.x, currentCannon.y - 30);
        this.cannonIndicator.setVisible(true);
      } else {
        this.cannonIndicator.setVisible(false);
      }
    } else if (canUseLeftCannon && !canUseHelm && !canUseAnchor) {
      // Cerca del cañón izquierdo
      this.cannonIndicator.setText('Presiona E para usar cañón');
      this.cannonIndicator.setPosition(this.ship.cannons.left.x, this.ship.cannons.left.y - 20);
      this.cannonIndicator.setVisible(true);
    } else if (canUseRightCannon && !canUseHelm && !canUseAnchor && !canUseLeftCannon) {
      // Cerca del cañón derecho
      this.cannonIndicator.setText('Presiona E para usar cañón');
      this.cannonIndicator.setPosition(this.ship.cannons.right.x, this.ship.cannons.right.y - 20);
      this.cannonIndicator.setVisible(true);
    } else {
      this.cannonIndicator.setVisible(false);
    }

    // Montar/desmontar cañón con E
    if (inputEnabled && keyEJustPressed) {
      if (this.player.isOnCannon) {
        // Desmontar
        dismountCannon(this.player);
        this.cameras.main.startFollow(this.player, 1, 1);
      } else if (canUseLeftCannon && !canUseHelm && !canUseAnchor) {
        // Montar cañón izquierdo
        mountCannon(this.player, this.ship.cannons.left, 'left');
        this.cameras.main.startFollow(this.ship.cannons.left, 1, 1);
      } else if (canUseRightCannon && !canUseHelm && !canUseAnchor && !canUseLeftCannon) {
        // Montar cañón derecho
        mountCannon(this.player, this.ship.cannons.right, 'right');
        this.cameras.main.startFollow(this.ship.cannons.right, 1, 1);
      }
    }

    // Controles del cañón (cuando está montado)
    if (this.player.isOnCannon && inputEnabled) {
      const currentCannon = this.player.cannonSide === 'left' ? this.ship.cannons.left : this.ship.cannons.right;

      // Rotar cañón con A/D
      updateCannonRotation(currentCannon, input.keyA, input.keyD, delta);

      // Disparar con W
      if (Phaser.Input.Keyboard.JustDown(input.keySpace)) {
        if (canShootLeft && this.player.cannonSide === 'left') {
          fireCannonball(this, currentCannon, this.ship, this.socket);
          canShootLeft = false;
          leftCannonLastShot = time;
          this.time.addEvent({
            delay: cooldownTime,
            callback: () => { canShootLeft = true; },
            callbackScope: this
          });
        } else if (canShootRight && this.player.cannonSide === 'right') {
          fireCannonball(this, currentCannon, this.ship, this.socket);
          canShootRight = false;
          rightCannonLastShot = time;
          this.time.addEvent({
            delay: cooldownTime,
            callback: () => { canShootRight = true; },
            callbackScope: this
          });
        }
      }
    }

    // ===== ACTUALIZAR PLAYER (usa shipFunctions y playerFunctions) =====
    updatePlayer(this, this.player, this.ship, input, deltaTime, inputEnabled);

    // ===== ACTUALIZAR SHIP (física independiente) =====
    updateShip(this, this.ship, this.player.isControllingShip, input, inputEnabled);

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

    // Emitir si es el primer frame O si algo cambió
    if (!this.ship.oldPosition ||
        x !== this.ship.oldPosition.x ||
        y !== this.ship.oldPosition.y ||
        r !== this.ship.oldPosition.rotation ||
        playerRelativeX !== this.ship.oldPosition.playerX ||
        playerRelativeY !== this.ship.oldPosition.playerY ||
        this.player.rotation !== this.ship.oldPosition.playerRotation) {

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
          steeringDirection: this.steeringDirection,  // Ship steering wheel position
          cannons: {
            leftAngle: this.ship.cannons ? this.ship.cannons.left.relativeAngle : 0,
            rightAngle: this.ship.cannons ? this.ship.cannons.right.relativeAngle : 0
          }
        },
        player: {
          x: playerRelativeX,
          y: playerRelativeY,
          rotation: this.player.rotation,
          isControllingShip: this.player.isControllingShip,
          isOnCannon: this.player.isOnCannon,
          cannonSide: this.player.cannonSide,
          isMoving: isPlayerMoving,  // Animation sync
          velocityX: this.player.body.velocity.x,
          velocityY: this.player.body.velocity.y
        }
      });
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
      fontSize: '16px',
      fill: '#ffffff',
      fontStyle: 'bold'
    }).setScrollFactor(0).setDepth(2001).setOrigin(0.5);

    // Coordenadas del jugador
    this.mapCoordinates = this.add.text(cameraX, mapY + mapHeight + 20, 'Coordenadas: 0, 0', {
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

    // ===== ACTUALIZAR MAPA =====
    const mapVisible = this.mainScene.mapVisible;

    // Mostrar/ocultar elementos del mapa
    this.mapBackground.setVisible(mapVisible);
    this.mapTitle.setVisible(mapVisible);
    this.mapCoordinates.setVisible(mapVisible);

    if (mapVisible) {
      const currentRoomX = this.mainScene.currentRoomX;
      const currentRoomY = this.mainScene.currentRoomY;
      const visitedRooms = this.mainScene.visitedRooms;

      // Actualizar texto de coordenadas
      this.mapCoordinates.setText(`Coordenadas: ${currentRoomX}, ${currentRoomY}`);

      // Grid es 9x9, centrado en room actual
      const halfSize = 4; // (9-1)/2

      this.mapCells.forEach(cell => {
        cell.rect.setVisible(true);

        // Calcular coordenadas de room para esta celda
        const roomX = currentRoomX + (cell.col - halfSize);
        const roomY = currentRoomY + (cell.row - halfSize);
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

        // Celda del room actual está en el centro (col=4, row=4)
        const centerCol = 4;
        const centerRow = 4;
        const cellCenterX = mapX + centerCol * cellSize + cellSize / 2;
        const cellCenterY = mapY + centerRow * cellSize + cellSize / 2;

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
        this.playerIndicator.setVisible(false);
      }
    } else {
      this.mapCells.forEach(cell => cell.rect.setVisible(false));
      this.playerIndicator.setVisible(false);
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