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

  this.load.audio('shoot', ['sounds/bow5.ogg', 'sounds/bow5.mp3']);

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

  // Crear TileSprite para el fondo del océano
  this.oceanBackground = this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'oceanTile');
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
  this.otherShips = this.physics.add.group();
  this.otherBullets = this.physics.add.group();

  this.socket.on('currentPlayers', function (players) {
    // Clear all existing other players when receiving fresh player list (e.g., room change)
    self.otherShips.getChildren().forEach(function (otherShip) {
      if (otherShip.playerSprite) {
        otherShip.playerSprite.destroy();
      }
      removeShipWakeEmitters(otherShip);
      otherShip.destroy();
    });
    self.otherShips.clear(true, true);

    Object.keys(players).forEach(function (id) {
      if (players[id].playerId === self.socket.id) {
        // Create or update my ship and player
        if (!self.ship) {
          self.ship = addShip(self, players[id].ship);
          self.ship.playerId = players[id].playerId;

          self.player = addPlayer(self, players[id].player, self.ship);

          setupShipCollisions(self, self.ship);

          // Add wake emitters to ship
          addShipWakeEmitters(self, self.ship);

          // Create cannons for the ship
          self.ship.cannons = createCannons(self, self.ship);
          updateCannonPosition(self.ship.cannons.left, self.ship, 'left');
          updateCannonPosition(self.ship.cannons.right, self.ship, 'right');

          // Initialize steering variable
          self.steeringDirection = 0;
        } else {
          // Update ship position (for room transition)
          self.ship.setPosition(players[id].ship.x, players[id].ship.y);
          self.ship.setRotation(players[id].ship.rotation);
          self.player.setPosition(
            players[id].ship.x + players[id].player.x,
            players[id].ship.y + players[id].player.y
          );
        }
      } else {
        // Create ships and players of others
        const otherShip = addOtherShip(self, players[id].ship);
        otherShip.playerId = players[id].playerId;

        const otherPlayer = addOtherPlayer(self, players[id].player, otherShip);
        otherShip.playerSprite = otherPlayer;

        // Add wake emitters to ship
        addShipWakeEmitters(self, otherShip);

        // Create cannons for other ships
        otherShip.cannons = createCannons(self, otherShip);
        updateCannonPosition(otherShip.cannons.left, otherShip, 'left');
        updateCannonPosition(otherShip.cannons.right, otherShip, 'right');

        self.otherShips.add(otherShip);
      }
    });
  });

  this.socket.on('newPlayer', function (playerInfo) {
    const otherShip = addOtherShip(self, playerInfo.ship);
    otherShip.playerId = playerInfo.playerId;

    const otherPlayer = addOtherPlayer(self, playerInfo.player, otherShip);
    otherShip.playerSprite = otherPlayer;

    // Inicializar estado de animación
    const playerVelX = playerInfo.player.velocityX || 0;
    const playerVelY = playerInfo.player.velocityY || 0;
    const playerSpeed = Math.sqrt(playerVelX * playerVelX + playerVelY * playerVelY);
    const isMoving = playerSpeed > 10;

    if (isMoving && !playerInfo.player.isControllingShip) {
      otherPlayer.play('run');
    } else {
      otherPlayer.setFrame('tile000.png');
    }

    // Agregar emisores de estela al barco
    addShipWakeEmitters(self, otherShip);

    // Create cannons for the new ship
    otherShip.cannons = createCannons(self, otherShip);
    updateCannonPosition(otherShip.cannons.left, otherShip, 'left');
    updateCannonPosition(otherShip.cannons.right, otherShip, 'right');

    self.otherShips.add(otherShip);
  });

  this.socket.on('disconnect', function (playerId) {
    self.otherShips.getChildren().forEach(function (otherShip) {
      if (playerId === otherShip.playerId) {
        // Destruir jugador del barco
        if (otherShip.playerSprite) {
          otherShip.playerSprite.destroy();
        }
        // Limpiar emisores de estela
        removeShipWakeEmitters(otherShip);
        // Destruir barco
        otherShip.destroy();
      }
    });
  });

  this.socket.on('playerMoved', function (playerInfo) {
    self.otherShips.getChildren().forEach(function (otherShip) {
      if (playerInfo.playerId === otherShip.playerId) {
        // Actualizar barco
        otherShip.setRotation(playerInfo.ship.rotation);
        otherShip.setPosition(playerInfo.ship.x, playerInfo.ship.y);

        // Calcular y guardar currentSpeed para el sistema de partículas
        const velocityX = playerInfo.ship.velocityX || 0;
        const velocityY = playerInfo.ship.velocityY || 0;
        otherShip.currentSpeed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);

        // Por ahora, asumimos que el ancla está levantada (el servidor podría enviarlo en el futuro)
        otherShip.isAnchored = false;

        // Actualizar jugador
        if (otherShip.playerSprite) {
          otherShip.playerSprite.setPosition(
            playerInfo.ship.x + playerInfo.player.x,
            playerInfo.ship.y + playerInfo.player.y
          );
          otherShip.playerSprite.setRotation(playerInfo.player.rotation);

          // Sincronizar animación basada en velocidad del jugador
          const playerVelX = playerInfo.player.velocityX || 0;
          const playerVelY = playerInfo.player.velocityY || 0;
          const playerSpeed = Math.sqrt(playerVelX * playerVelX + playerVelY * playerVelY);
          const isMoving = playerSpeed > 10;

          if (isMoving && !playerInfo.player.isControllingShip) {
            // Jugador caminando - reproducir animación
            if (!otherShip.playerSprite.anims.isPlaying ||
                otherShip.playerSprite.anims.currentAnim.key !== 'run') {
              otherShip.playerSprite.play('run');
            }
          } else {
            // Jugador quieto o en el timón - detener animación
            if (otherShip.playerSprite.anims.isPlaying) {
              otherShip.playerSprite.stop();
              otherShip.playerSprite.setFrame('tile000.png');
            }
          }
        }

        // Actualizar cañones
        if (otherShip.cannons && playerInfo.ship.cannons) {
          otherShip.cannons.left.relativeAngle = playerInfo.ship.cannons.leftAngle || 0;
          otherShip.cannons.right.relativeAngle = playerInfo.ship.cannons.rightAngle || 0;
          updateCannonPosition(otherShip.cannons.left, otherShip, 'left');
          updateCannonPosition(otherShip.cannons.right, otherShip, 'right');
        }

        // Actualizar roturas
        if (otherShip.damages) {
          otherShip.damages.forEach(damageSprite => {
            const angle = otherShip.rotation;
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            // Encontrar el damage correspondiente
            const damage = playerInfo.ship.damages.find(d => d.id === damageSprite.damageId);
            if (damage) {
              const rotatedX = damage.x * cosAngle - damage.y * sinAngle;
              const rotatedY = damage.x * sinAngle + damage.y * cosAngle;

              damageSprite.setPosition(
                otherShip.x + rotatedX,
                otherShip.y + rotatedY
              );
            }
          });
        }
      }
    });
  });

  this.socket.on('newBullet', function (creationData) {
    console.log("PRE ADD BULLET ", creationData)
    addBullet(self, creationData);
  });

  // Evento cuando un barco recibe daño
  this.socket.on('shipTookDamage', function (damageInfo) {
    if (damageInfo.playerId === self.socket.id) {
      // Es nuestro barco, ya creamos la rotura localmente
      return;
    }

    // Es otro barco, crear la rotura
    self.otherShips.getChildren().forEach(function (otherShip) {
      if (damageInfo.playerId === otherShip.playerId) {
        const damageSprite = self.add.rectangle(
          otherShip.x + damageInfo.damage.x,
          otherShip.y + damageInfo.damage.y,
          10, 10, 0xff0000
        );
        damageSprite.setDepth(2);
        damageSprite.damageId = damageInfo.damage.id;
        otherShip.damages.push(damageSprite);
      }
    });
  });

  this.socket.on('playerIsDead', function (playerInfo, deathData) {
    self.otherShips.getChildren().forEach(function (otherShip) {
      if (playerInfo.playerId === otherShip.playerId) {

        // console.log("HEARING PLAYER DEATH SOUND")

        // // LOGICA DE VOLUMEN DEPENDIENDO DISTANCIA

        // const distance = Phaser.Math.Distance.Between(self.ship.x, self.ship.y, deathData.x, deathData.y);

        // // Define una función que ajusta el volumen en función de la distancia.
        // function calculateVolume(distance, maxDistance) {
        //   // Puedes ajustar esta fórmula según tus necesidades.
        //   // En este caso, el volumen disminuirá linealmente a medida que la distancia aumenta.
        //   return Math.max(0, 1 - distance / maxDistance);
        // }

        // const maxDistance = 1000; // La distancia máxima a la que quieres que el sonido sea audible.

        // const volume = calculateVolume(distance, maxDistance);

        // console.log("PLAYER DEATH VOLUME: ", 0.03 * volume)

        // // Establece el volumen del sonido en función de la distancia.
        // self.playerDeathSound.setVolume(0.03 * volume);

        // self.playerDeathSound.play();

        if (otherShip.playerSprite) {
          otherShip.playerSprite.setTexture(playerInfo.sprite)
          otherShip.playerSprite.setPosition(playerInfo.x, playerInfo.y)
          otherShip.playerSprite.setRotation(playerInfo.rotation)
        }
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
    const MAX_CHAT_DISTANCE = 550; // Distancia máxima para ver mensajes

    // Si es mi propio mensaje, mostrarlo sobre mi jugador
    if (messageData.playerId === self.socket.id) {
      showChatBubble(self, self.player, messageData.message);
      return;
    }

    // Buscar al jugador que envió el mensaje
    self.otherShips.getChildren().forEach(function (otherShip) {
      if (messageData.playerId === otherShip.playerId) {
        // Calcular distancia entre mi barco y el otro barco
        const distance = Phaser.Math.Distance.Between(
          self.ship.x, self.ship.y,
          otherShip.x, otherShip.y
        );

        // Solo mostrar si está dentro del rango
        if (distance <= MAX_CHAT_DISTANCE) {
          showChatBubble(self, otherShip.playerSprite, messageData.message);
        }
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
      keyM: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M)
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
      if (Phaser.Input.Keyboard.JustDown(input.keyW)) {
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

    // Actualizar emisores de estela para todos los otherShips
    this.otherShips.getChildren().forEach(function (otherShip) {
      updateShipWakeEmitters(otherShip);
    });

    // ===== ACTUALIZAR POSICIONES DE BURBUJAS DE CHAT =====
    // Actualizar burbujas del jugador local
    if (this.player) {
      updateChatBubblePosition(this.player);
    }

    // Actualizar burbujas de otros jugadores
    this.otherShips.getChildren().forEach(function (otherShip) {
      if (otherShip.playerSprite) {
        updateChatBubblePosition(otherShip.playerSprite);
      }
    });

    // Calcular posición relativa del jugador al barco
    const playerRelativeX = this.player.x - this.ship.x;
    const playerRelativeY = this.player.y - this.ship.y;

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
      0xffffff,
      0
    );
    this.dayNightOverlay.setScrollFactor(0);
    this.dayNightOverlay.setDepth(50); // Above game world, below UI elements

    // Barra de salud del barco (parte superior central)
    this.healthBarBg = this.add.rectangle(cameraX, 30, 204, 24, 0x000000)
      .setScrollFactor(0)
      .setDepth(100);

    this.healthBarFill = this.add.rectangle(cameraX - 100, 30, 200, 20, 0x00ff00)
      .setScrollFactor(0)
      .setDepth(101)
      .setOrigin(0, 0.5);

    this.healthText = this.add.text(cameraX, 30, 'HP: 100%', {
      fontSize: '14px',
      fill: '#ffffff',
      fontStyle: 'bold'
    }).setScrollFactor(0).setDepth(102).setOrigin(0.5);

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

  update() {
    // ===== ACTUALIZAR DÍA/NOCHE =====
    if (this.mainScene.gameTime && this.dayNightOverlay) {
      const timeRatio = this.mainScene.gameTime.timeRatio;

      // Calculate color and alpha based on time of day
      // timeRatio: 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset, 1=midnight
      let color, alpha;

      if (timeRatio < 0.25) {
        // Night to Sunrise (0.0 - 0.25)
        const t = timeRatio / 0.25; // 0 to 1
        color = this.interpolateColor(0x0a0a1e, 0xFFCC88, t);
        alpha = 0.9 - (t * 0.6); // 0.9 to 0.3
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
        color = this.interpolateColor(0xFF8844, 0x0a0a1e, t);
        alpha = 0.35 + (t * 0.55); // 0.35 to 0.9
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

    // Actualizar barra de salud
    if (this.mainScene.ship) {
      const healthPercent = Math.max(0, Math.min(100, this.mainScene.ship.health));
      this.healthBarFill.width = (healthPercent / 100) * 200;
      this.healthText.setText('HP: ' + Math.floor(healthPercent) + '%');

      // Cambiar color según salud
      if (healthPercent > 60) {
        this.healthBarFill.setFillStyle(0x00ff00); // Verde
      } else if (healthPercent > 30) {
        this.healthBarFill.setFillStyle(0xffff00); // Amarillo
      } else {
        this.healthBarFill.setFillStyle(0xff0000); // Rojo
      }
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