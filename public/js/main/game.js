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

  this.load.audio('shoot', ['sounds/bow5.ogg', 'sounds/bow5.mp3']);

  this.load.image('playerMuerto', 'assets/player_muerto.png');


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

  var self = this;
  this.socket = io();

  // Room tracking
  this.currentRoomX = 0;
  this.currentRoomY = 0;
  this.visitedRooms = new Set();
  this.visitedRooms.add('0,0'); // Add initial room
  this.mapVisible = false;

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

        self.otherShips.add(otherShip);
      }
    });
  });

  this.socket.on('newPlayer', function (playerInfo) {
    const otherShip = addOtherShip(self, playerInfo.ship);
    otherShip.playerId = playerInfo.playerId;

    const otherPlayer = addOtherPlayer(self, playerInfo.player, otherShip);
    otherShip.playerSprite = otherPlayer;

    // Agregar emisores de estela al barco
    addShipWakeEmitters(self, otherShip);

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
      keySpace: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      keyLeft: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      keyRight: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      keyPlus: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
      keyMinus: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
      keyM: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M)
    };

    // Guardar estado de JustDown para E (solo se puede llamar una vez por frame)
    const keyEJustPressed = Phaser.Input.Keyboard.JustDown(input.keyE);

    // Toggle mapa con M
    if (Phaser.Input.Keyboard.JustDown(input.keyM)) {
      this.mapVisible = !this.mapVisible;
      console.log(`Map ${this.mapVisible ? 'shown' : 'hidden'}`);
    }

    // ===== SISTEMA DE ZOOM =====
    // Zoom con teclas +/- (cada tap hace un cambio mayor)
    if (Phaser.Input.Keyboard.JustDown(input.keyPlus)) {
      this.targetZoom = Math.min(ZOOM_MAX, this.currentZoom + ZOOM_STEP);
    }
    if (Phaser.Input.Keyboard.JustDown(input.keyMinus)) {
      this.targetZoom = Math.max(ZOOM_MIN, this.currentZoom - ZOOM_STEP);
    }

    // Zoom con rueda del mouse
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
      if (deltaY > 0) {
        this.targetZoom = Math.max(ZOOM_MIN, this.currentZoom - ZOOM_STEP);
      } else if (deltaY < 0) {
        this.targetZoom = Math.min(ZOOM_MAX, this.currentZoom + ZOOM_STEP);
      }
    });

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
    if (keyEJustPressed && canUseHelm) {
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
    if (keyEJustPressed && canUseAnchor && !canUseHelm) {
      this.ship.isAnchored = !this.ship.isAnchored;
      if (!this.ship.isAnchored) {
        const currentSpeed = Math.sqrt(this.ship.body.velocity.x ** 2 + this.ship.body.velocity.y ** 2);
        this.ship.targetSpeed = currentSpeed;
      }
    }

    // ===== SISTEMA DE CAÑÓN IZQUIERDO =====
    const leftCannonOffset = 50;
    // Perpendicular a la izquierda del barco
    const leftCannonX = this.ship.x + Math.cos(this.ship.rotation - Math.PI) * leftCannonOffset;
    const leftCannonY = this.ship.y + Math.sin(this.ship.rotation - Math.PI) * leftCannonOffset;

    const distanceToLeftCannon = Phaser.Math.Distance.Between(this.player.x, this.player.y, leftCannonX, leftCannonY);
    const canUseLeftCannon = distanceToLeftCannon < 15;

    // Indicador de cañón izquierdo
    if (!this.leftCannonIndicator) {
      this.leftCannonIndicator = this.add.text(0, 0, '', {
        fontSize: '12px',
        fill: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 5, y: 3 }
      }).setDepth(10).setOrigin(0.5);
    }

    // Actualizar texto del indicador según cooldown
    let leftCannonText = '';
    if (canShootLeft) {
      leftCannonText = 'Presiona E para disparar cañón';
    } else {
      const timeRemaining = Math.ceil((cooldownTime - (time - leftCannonLastShot)) / 1000);
      leftCannonText = 'Recargando... (' + timeRemaining + 's)';
    }
    this.leftCannonIndicator.setText(leftCannonText);

    if (canUseLeftCannon) {
      this.leftCannonIndicator.setPosition(leftCannonX, leftCannonY - 20);
      this.leftCannonIndicator.setVisible(true);
    } else {
      this.leftCannonIndicator.setVisible(false);
    }

    // Disparar cañón izquierdo con E (solo si NO estás cerca del timón, ancla)
    if (keyEJustPressed && canUseLeftCannon && !canUseHelm && !canUseAnchor && canShootLeft) {
      this.socket.emit('createBullet', {
        x: this.ship.x,
        y: this.ship.y,
        shooterId: this.ship.playerId,
        rotation: this.ship.rotation,
        direction: "left"
      });
      this.cameras.main.shake(100, 0.003);

      canShootLeft = false;
      leftCannonLastShot = time;
      this.time.addEvent({
        delay: cooldownTime,
        callback: () => { canShootLeft = true; },
        callbackScope: this
      });
    }

    // ===== SISTEMA DE CAÑÓN DERECHO =====
    const rightCannonOffset = 50;
    // Perpendicular a la derecha del barco
    const rightCannonX = this.ship.x + Math.cos(this.ship.rotation) * rightCannonOffset;
    const rightCannonY = this.ship.y + Math.sin(this.ship.rotation) * rightCannonOffset;

    const distanceToRightCannon = Phaser.Math.Distance.Between(this.player.x, this.player.y, rightCannonX, rightCannonY);
    const canUseRightCannon = distanceToRightCannon < 15;

    // Indicador de cañón derecho
    if (!this.rightCannonIndicator) {
      this.rightCannonIndicator = this.add.text(0, 0, '', {
        fontSize: '12px',
        fill: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 5, y: 3 }
      }).setDepth(10).setOrigin(0.5);
    }

    // Actualizar texto del indicador según cooldown
    let rightCannonText = '';
    if (canShootRight) {
      rightCannonText = 'Presiona E para disparar cañón';
    } else {
      const timeRemaining = Math.ceil((cooldownTime - (time - rightCannonLastShot)) / 1000);
      rightCannonText = 'Recargando... (' + timeRemaining + 's)';
    }
    this.rightCannonIndicator.setText(rightCannonText);

    if (canUseRightCannon) {
      this.rightCannonIndicator.setPosition(rightCannonX, rightCannonY - 20);
      this.rightCannonIndicator.setVisible(true);
    } else {
      this.rightCannonIndicator.setVisible(false);
    }

    // Disparar cañón derecho con E (solo si NO estás cerca del timón, ancla, ni cañón izquierdo)
    if (keyEJustPressed && canUseRightCannon && !canUseHelm && !canUseAnchor && !canUseLeftCannon && canShootRight) {
      this.socket.emit('createBullet', {
        x: this.ship.x,
        y: this.ship.y,
        shooterId: this.ship.playerId,
        rotation: this.ship.rotation,
        direction: "right"
      });
      this.cameras.main.shake(100, 0.003);

      canShootRight = false;
      rightCannonLastShot = time;
      this.time.addEvent({
        delay: cooldownTime,
        callback: () => { canShootRight = true; },
        callbackScope: this
      });
    }

    // ===== ACTUALIZAR PLAYER (usa shipFunctions y playerFunctions) =====
    updatePlayer(this, this.player, this.ship, input, deltaTime);

    // ===== ACTUALIZAR SHIP (física independiente) =====
    updateShip(this, this.ship, this.player.isControllingShip, input);

    // ===== ACTUALIZAR EMISORES DE ESTELA =====
    updateShipWakeEmitters(this.ship);

    // Actualizar emisores de estela para todos los otherShips
    this.otherShips.getChildren().forEach(function (otherShip) {
      updateShipWakeEmitters(otherShip);
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
          velocityY: this.ship.body.velocity.y
        },
        player: {
          x: playerRelativeX,
          y: playerRelativeY,
          rotation: this.player.rotation,
          isControllingShip: this.player.isControllingShip
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

    // Room indicator (esquina superior izquierda)
    this.roomText = this.add.text(15, 100, 'Room: (0, 0)', {
      fontSize: '20px',
      fill: '#00ff00',
      backgroundColor: '#000000',
      padding: { x: 10, y: 6 },
      fontStyle: 'bold'
    });
    this.roomText.setScrollFactor(0);
    this.roomText.setDepth(1000);
    this.roomText.setOrigin(0, 0);
    console.log('Room text created:', this.roomText);

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

    // Indicador de estado (manejando / caminando)
    this.statusText = this.add.text(cameraX, 60, 'Caminando', {
      fontSize: '14px',
      fill: '#ffff00',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5);

    // Indicador de timón
    this.steeringText = this.add.text(cameraX, cameraY + 80, 'Timón: 0', {
      fontSize: 14,
      fill: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 5, y: 3 }
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5);

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
  }

  update() {
    // Actualizar indicador de room
    if (this.mainScene && this.mainScene.currentRoomX !== undefined && this.mainScene.currentRoomY !== undefined) {
      const roomText = `Room: (${this.mainScene.currentRoomX}, ${this.mainScene.currentRoomY})`;
      if (this.roomText) {
        this.roomText.setText(roomText);
        this.roomText.setVisible(true); // Asegurar que sea visible
      }
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
        this.statusText.setText('En el timón');
        this.statusText.setStyle({ fill: '#00ff00' });

        this.steeringText.setVisible(true);
        this.steeringText.setText('Dirección: ' + this.mainScene.steeringDirection);
      } else {
        this.statusText.setText('Caminando');
        this.statusText.setStyle({ fill: '#ffff00' });

        this.steeringText.setVisible(false);
      }
    }
  }

}