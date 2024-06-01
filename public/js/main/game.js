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
  this.load.image('otherPlayer', 'assets/ship.png');

  this.load.audio('enterGame', ['sounds/portalenter.ogg', 'sounds/portalenter.mp3']);

  this.load.image('tiles', 'tileset/spritesheet-extruded.png');
  this.load.tilemapTiledJSON('tilemap', 'tileset/tilemap.json');

}

function create() {

  let canvas = this.sys.canvas;
  canvas.style.cursor = 'default';

  var enterGame = this.sound.add('enterGame');
  enterGame.setVolume(0.1)
  enterGame.play()
  game.sound.context.resume();

  let { width, height } = this.sys.game.canvas;

  this.windowData = { width: width, height: height }

  this.input.setDefaultCursor('default');

  // game.scale.startFullscreen();
  this.cameras.main.setViewport(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  this.cameras.main.setZoom(1);

  var self = this;
  this.socket = io();

  // Crear una escena de "UI" que se superpondrá a la escena principal
  self.scene.add('UIScene', UIScene, true);

  // Groups
  this.otherPlayers = this.physics.add.group();

  this.socket.on('currentPlayers', function (players) {
    Object.keys(players).forEach(function (id) {
      if (players[id].playerId === self.socket.id) {
        addPlayer(self, players[id]);
      } else {
        addOtherPlayers(self, players[id]);
      }
    });
  });

  this.socket.on('newPlayer', function (playerInfo) {
    addOtherPlayers(self, playerInfo);
  });

  this.socket.on('disconnect', function (playerId) {
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (playerId === otherPlayer.playerId) {
        otherPlayer.destroy();
      }
    });
  });

  this.socket.on('playerMoved', function (playerInfo) {
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (playerInfo.playerId === otherPlayer.playerId) {
        otherPlayer.setRotation(playerInfo.rotation);
        otherPlayer.setPosition(playerInfo.x, playerInfo.y);
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

function update() {
  let keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
  let keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  let keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

  if (Phaser.Input.Keyboard.JustDown(keySpace)) {
    isAnchored = !isAnchored;  // Alternar el estado del ancla
    if (!isAnchored) {
      // Cuando se suelta el ancla, establecer targetSpeed a la velocidad actual
      const currentSpeed = Math.sqrt(this.ship.body.velocity.x ** 2 + this.ship.body.velocity.y ** 2);
      targetSpeed = currentSpeed;
    }
  }

  if (this.ship) {
    // Control de la dirección del timón
    if (keyA.isDown) {
      // Girar a la izquierda
      steeringDirection = Phaser.Math.Clamp(steeringDirection - steeringIncrement, -maxSteeringDirection, maxSteeringDirection);
      maxLeftSteering = Math.min(maxLeftSteering, steeringDirection);
    } else if (keyD.isDown) {
      // Girar a la derecha
      steeringDirection = Phaser.Math.Clamp(steeringDirection + steeringIncrement, -maxSteeringDirection, maxSteeringDirection);
      maxRightSteering = Math.max(maxRightSteering, steeringDirection);
    }

    // Bloquear la dirección del timón en su posición máxima
    if (steeringDirection <= -maxSteeringDirection || steeringDirection >= maxSteeringDirection) {
      steeringDirection = Math.max(Math.min(steeringDirection, maxRightSteering), maxLeftSteering);
    }

    // Ajustar la dirección a 0 si está entre -3 y 3
    if ((steeringDirection >= -3 && steeringDirection <= 3) && !(keyA.isDown || keyD.isDown)) {
      steeringDirection = 0;
    }

    // Convertir la dirección del timón a velocidad angular
    const angularVelocity = steeringDirection / maxSteeringDirection * turnSpeed;
    this.ship.setAngularVelocity(angularVelocity);

    // Aplicar la velocidad calculada
    const maxSpeed = isDrifting ? maxSpeedForward * driftFactor : maxSpeedForward;
    const angle = this.ship.rotation - Math.PI / 2;
    let velocityX, velocityY;

    if (isAnchored) {
      // Reducir la velocidad gradualmente
      this.ship.setVelocity(this.ship.body.velocity.x * 0.99, this.ship.body.velocity.y * 0.99);
    } else {
      // Acelerar gradualmente hasta la velocidad objetivo
      targetSpeed = Math.min(targetSpeed + 1, maxSpeed);
      const newSpeed = isDrifting ? targetSpeed * driftFactor : targetSpeed;
      velocityX = Math.cos(angle) * newSpeed;
      velocityY = Math.sin(angle) * newSpeed;
      this.ship.setVelocity(velocityX, velocityY);
    }

    this.physics.world.wrap(this.ship, 0);

    // Emitir movimiento del jugador
    var x = this.ship.x;
    var y = this.ship.y;
    var r = this.ship.rotation;
    if (this.ship.oldPosition && (x !== this.ship.oldPosition.x || y !== this.ship.oldPosition.y || r !== this.ship.oldPosition.rotation || r !== this.ship.oldPosition.sprite)) {
      this.socket.emit('playerMovement', { x: this.ship.x, y: this.ship.y, rotation: this.ship.rotation, sprite: this.ship.texture.key });
    }

    // Guardar datos de la posición anterior
    this.ship.oldPosition = {
      x: this.ship.x,
      y: this.ship.y,
      rotation: this.ship.rotation,
      sprite: this.ship.texture.key
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
    const cameraX = this.mainScene.cameras.main.width / 2 - 6;
    const cameraY = this.mainScene.cameras.main.height / 2 - 60;

    // Crear un texto para mostrar el nombre del usuario
    this.mainScene.currentSteeringDirectionText = this.add.text(cameraX, cameraY, steeringDirection, {
      fontSize: 18,
      fill: '#ffffff'
    });
  }

  update() {
    this.mainScene.currentSteeringDirectionText.setText(steeringDirection);
  }

}