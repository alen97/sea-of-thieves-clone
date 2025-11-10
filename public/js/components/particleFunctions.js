// Configuration constants for water wake particles
const WAKE_CONFIG = {
  texture: 'bullet',
  tint: 0xFFFFFF,
  minSpeed: 5,
  speed: { min: 30, max: 70 },
  lifespan: { min: 1200, max: 2000 },
  scale: { start: 0.6, end: 0.05 },
  alpha: { start: 0.5, end: 0 },
  blendMode: 'ADD',
  frequency: 80,
  quantity: 1,
  gravityY: 0,
  rotate: { start: 0, end: 360 }
};

// Offset position for central wake emitter
const WAKE_OFFSET = { x: 0, y: 70 };

// Global particle manager (shared across all ships)
let particleManager = null;

/**
 * Create and initialize the wake particle system
 * @param {Phaser.Scene} scene - The game scene
 */
function createWakeParticleSystem(scene) {
  if (!particleManager) {
    particleManager = scene.add.particles(WAKE_CONFIG.texture);
  }
  return particleManager;
}

/**
 * Add wake particle emitter to a ship
 * @param {Phaser.Scene} scene - The game scene
 * @param {Phaser.GameObjects.Sprite} ship - The ship object
 */
function addShipWakeEmitters(scene, ship) {
  if (!particleManager) {
    createWakeParticleSystem(scene);
  }

  // Initialize wake emitter (single central emitter for subtle swoosh effect)
  ship.wakeEmitter = particleManager.createEmitter({
    speed: WAKE_CONFIG.speed,
    lifespan: WAKE_CONFIG.lifespan,
    scale: WAKE_CONFIG.scale,
    alpha: WAKE_CONFIG.alpha,
    tint: WAKE_CONFIG.tint,
    blendMode: WAKE_CONFIG.blendMode,
    frequency: WAKE_CONFIG.frequency,
    quantity: WAKE_CONFIG.quantity,
    angle: { min: 150, max: 210 }, // Will be updated dynamically
    gravityY: WAKE_CONFIG.gravityY,
    rotate: WAKE_CONFIG.rotate,
    on: false
  });

  // Don't use offset in startFollow - we'll calculate rotated position manually
  ship.wakeEmitter.stopFollow();
}

/**
 * Update wake emitter based on ship speed
 * @param {Phaser.GameObjects.Sprite} ship - The ship object
 */
function updateShipWakeEmitters(ship) {
  if (!ship.wakeEmitter) {
    return;
  }

  // Determine if ship is moving fast enough to show wake
  let isMoving = false;
  let speedIntensity = 0;

  if (ship.currentSpeed !== undefined) {
    // For physics-enabled ships (player ship)
    isMoving = ship.currentSpeed > WAKE_CONFIG.minSpeed && !ship.isAnchored;
    speedIntensity = Math.min(ship.currentSpeed / 100, 1);
  } else if (ship.body && ship.body.velocity) {
    // For ships with velocity tracking
    const speed = Math.sqrt(ship.body.velocity.x ** 2 + ship.body.velocity.y ** 2);
    isMoving = speed > WAKE_CONFIG.minSpeed;
    speedIntensity = Math.min(speed / 150, 1);
  }

  // Calculate rotated position for emitter (rotates offset with ship)
  const cos = Math.cos(ship.rotation);
  const sin = Math.sin(ship.rotation);
  const rotatedX = WAKE_OFFSET.x * cos - WAKE_OFFSET.y * sin;
  const rotatedY = WAKE_OFFSET.x * sin + WAKE_OFFSET.y * cos;
  ship.wakeEmitter.setPosition(ship.x + rotatedX, ship.y + rotatedY);

  // Calculate emission angle based on ship rotation (particles emit backward/outward)
  const shipAngleDegrees = (ship.rotation + Math.PI / 2) * (180 / Math.PI);
  const angleSpread = 50; // Wider spread for swoosh effect

  // Enable/disable emitter based on movement
  if (isMoving) {
    if (!ship.wakeEmitter.on) {
      ship.wakeEmitter.start();
    }

    // Adjust frequency based on speed (faster = more particles)
    ship.wakeEmitter.frequency = Math.max(60, WAKE_CONFIG.frequency - speedIntensity * 20);

    // Update emission angle to match ship rotation
    ship.wakeEmitter.setAngle({
      min: shipAngleDegrees - angleSpread,
      max: shipAngleDegrees + angleSpread
    });
  } else {
    if (ship.wakeEmitter.on) {
      ship.wakeEmitter.stop();
    }
  }
}

/**
 * Remove and cleanup wake emitter from a ship
 * @param {Phaser.GameObjects.Sprite} ship - The ship object
 */
function removeShipWakeEmitters(ship) {
  if (ship.wakeEmitter) {
    ship.wakeEmitter.stop();
    ship.wakeEmitter.remove();
    ship.wakeEmitter = null;
  }
}
