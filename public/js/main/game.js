const SCREEN_WIDTH = 1600
const SCREEN_HEIGHT = 1600

var config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.ENVELOP,
    parent: 'phaser-example',
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: SCREEN_WIDTH, // 640,
    height: SCREEN_HEIGHT // 480
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

  this.load.image('tiles', 'tileset/spritesheet-extruded.png');
  this.load.tilemapTiledJSON('tilemap', 'tileset/tilemap.json');

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
  this.cameras.main.setViewport(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  this.cameras.main.setZoom(1);

  var self = this;
  this.socket = io();

  // Crear una escena de "UI" que se superpondrá a la escena principal
  self.scene.add('UIScene', UIScene, true);

  // Groups
  this.otherPlayers = this.physics.add.group();
  this.otherBullets = this.physics.add.group();

  this.socket.on('currentPlayers', function (players) {
    Object.keys(players).forEach(function (id) {
      if (players[id].playerId === self.socket.id) {
        // Crear mi barco y mi jugador
        self.ship = addShip(self, players[id].ship);
        self.ship.playerId = players[id].playerId;

        self.player = addPlayer(self, players[id].player, self.ship);

        setupShipCollisions(self, self.ship);

        // Inicializar variable de steering
        self.steeringDirection = 0;
      } else {
        // Crear barco y jugador de otros
        const otherShip = addOtherShip(self, players[id].ship);
        otherShip.playerId = players[id].playerId;

        const otherPlayer = addOtherPlayer(self, players[id].player, otherShip);
        otherShip.playerSprite = otherPlayer;

        self.otherPlayers.add(otherShip);
      }
    });
  });

  this.socket.on('newPlayer', function (playerInfo) {
    const otherShip = addOtherShip(self, playerInfo.ship);
    otherShip.playerId = playerInfo.playerId;

    const otherPlayer = addOtherPlayer(self, playerInfo.player, otherShip);
    otherShip.playerSprite = otherPlayer;

    self.otherPlayers.add(otherShip);
  });

  this.socket.on('disconnect', function (playerId) {
    self.otherPlayers.getChildren().forEach(function (otherShip) {
      if (playerId === otherShip.playerId) {
        // Destruir jugador del barco
        if (otherShip.playerSprite) {
          otherShip.playerSprite.destroy();
        }
        // Destruir barco
        otherShip.destroy();
      }
    });
  });

  this.socket.on('playerMoved', function (playerInfo) {
    self.otherPlayers.getChildren().forEach(function (otherShip) {
      if (playerInfo.playerId === otherShip.playerId) {
        // Actualizar barco
        otherShip.setRotation(playerInfo.ship.rotation);
        otherShip.setPosition(playerInfo.ship.x, playerInfo.ship.y);

        // Actualizar jugador
        if (otherShip.playerSprite) {
          otherShip.playerSprite.setPosition(
            playerInfo.ship.x + playerInfo.player.x,
            playerInfo.ship.y + playerInfo.player.y
          );
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
    self.otherPlayers.getChildren().forEach(function (otherShip) {
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
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (playerInfo.playerId === otherPlayer.playerId) {

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

        otherPlayer.setTexture(playerInfo.sprite)
        otherPlayer.setPosition(playerInfo.x, playerInfo.y)
        otherPlayer.setRotation(playerInfo.rotation)
      }
    });
  });

  // ---------------- RENDER TILESET

  this.map = this.make.tilemap({ key: 'tilemap' });
  var tileset = this.map.addTilesetImage('tilemap_packed', 'tiles', 16, 16, 1, 2); // Nombre de imagen Tilemap
  // const tilemap = this.map.createLayer('objects', tileset, 0, 0);

  this.map.createStaticLayer("Tile Layer 1", tileset);

  // this.map.objects.forEach(object => {
  //   console.log("OBJECT NAME: ", object)
  //   if (object.name === "walls") {
  //     object.objects.forEach(objectToCreate => {
  //       console.log("OBJECT TO CREATE: ", objectToCreate)
  //       addWalls(this, objectToCreate)
  //     })
  //   }

}

////////////////////////////////////////// UPDATE

// Configuración de parámetros
const accelerationRateForward = 0.005;  // Tasa de aumento de aceleración al ir hacia adelante
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
      keyRight: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT)
    };

    // Guardar estado de JustDown para E (solo se puede llamar una vez por frame)
    const keyEJustPressed = Phaser.Input.Keyboard.JustDown(input.keyE);

    // ===== SISTEMA DE TIMÓN =====
    const helmOffset = 50;
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
    const anchorOffset = 50;
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
    const leftCannonOffset = 30;
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
    const rightCannonOffset = 30;
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
        playerRelativeY !== this.ship.oldPosition.playerY) {

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
      playerY: playerRelativeY
    };
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
  }

  update() {
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