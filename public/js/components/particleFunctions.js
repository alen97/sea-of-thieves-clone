// Base configuration for all wake particles
const BASE_WAKE_CONFIG = {
  texture: 'bullet',
  tint: 0xFFFFFF,
  minSpeed: 5,
  blendMode: 'ADD',
  gravityY: 0
};

// Unified configuration for all emitters (same for all 3)
const UNIFIED_EMITTER_CONFIG = {
  speed: { min: 30, max: 70 },
  lifespan: { min: 2000, max: 2000 },
  scale: { start: 0.6, end: 0.04 },
  alpha: { start: 0.5, end: 0 },
  frequency: 80,
  quantity: 1,
  angleSpread: 80,
  rotate: { start: 0, end: 360 }
};

// Emitter positions (3 symmetric emitters)
const EMITTER_POSITIONS = {
  FRONT: { x: 0, y: -70 },
  MIDDLE: { x: 0, y: -35 },
  BACK: { x: 0, y: 65 }
};

// Legacy support
const WAKE_CONFIG = BASE_WAKE_CONFIG;
const WAKE_OFFSET = EMITTER_POSITIONS.BACK;

// Global particle manager (shared across all ships)
let particleManager = null;

/**
 * Create and initialize the wake particle system
 * @param {Phaser.Scene} scene - The game scene
 */
function createWakeParticleSystem(scene) {
  if (!particleManager) {
    particleManager = scene.add.particles(BASE_WAKE_CONFIG.texture);
  }
  return particleManager;
}

/**
 * Create a single emitter with unified configuration
 * @returns {Phaser.GameObjects.Particles.ParticleEmitter}
 */
function createEmitter() {
  return particleManager.createEmitter({
    speed: UNIFIED_EMITTER_CONFIG.speed,
    lifespan: UNIFIED_EMITTER_CONFIG.lifespan,
    scale: UNIFIED_EMITTER_CONFIG.scale,
    alpha: UNIFIED_EMITTER_CONFIG.alpha,
    tint: BASE_WAKE_CONFIG.tint,
    blendMode: BASE_WAKE_CONFIG.blendMode,
    frequency: UNIFIED_EMITTER_CONFIG.frequency,
    quantity: UNIFIED_EMITTER_CONFIG.quantity,
    angle: { min: 0, max: 0 }, // Will be updated dynamically
    gravityY: BASE_WAKE_CONFIG.gravityY,
    rotate: UNIFIED_EMITTER_CONFIG.rotate,
    on: false
  });
}

/**
 * Add wake particle emitters to a ship (3 symmetric emitters)
 * @param {Phaser.Scene} scene - The game scene
 * @param {Phaser.GameObjects.Sprite} ship - The ship object
 */
function addShipWakeEmitters(scene, ship) {
  if (!particleManager) {
    createWakeParticleSystem(scene);
  }

  // Initialize 3 wake emitters
  ship.wakeEmitters = {
    front: createEmitter(),
    middle: createEmitter(),
    back: createEmitter()
  };

  // Stop following - we'll calculate rotated positions manually
  Object.values(ship.wakeEmitters).forEach(emitter => {
    emitter.stopFollow();
  });
}

/**
 * Calculate rotated position for an emitter offset
 * @param {Object} ship - The ship object
 * @param {Object} offset - Offset position {x, y}
 * @returns {Object} Rotated position {x, y}
 */
function calculateRotatedPosition(ship, offset) {
  const cos = Math.cos(ship.rotation);
  const sin = Math.sin(ship.rotation);
  return {
    x: ship.x + (offset.x * cos - offset.y * sin),
    y: ship.y + (offset.x * sin + offset.y * cos)
  };
}

/**
 * Update all 3 wake emitters based on ship speed (symmetric)
 * @param {Phaser.GameObjects.Sprite} ship - The ship object
 */
function updateShipWakeEmitters(ship) {
  if (!ship.wakeEmitters) {
    return;
  }

  // Determine if ship is moving fast enough to show wake
  let isMoving = false;
  let speedIntensity = 0;

  if (ship.currentSpeed !== undefined) {
    isMoving = ship.currentSpeed > BASE_WAKE_CONFIG.minSpeed && !ship.isAnchored;
    speedIntensity = Math.min(ship.currentSpeed / 100, 1);
  } else if (ship.body && ship.body.velocity) {
    const speed = Math.sqrt(ship.body.velocity.x ** 2 + ship.body.velocity.y ** 2);
    isMoving = speed > BASE_WAKE_CONFIG.minSpeed;
    speedIntensity = Math.min(speed / 150, 1);
  }

  // Ship angle in degrees for particle emission (emit backward)
  const shipAngleDegrees = (ship.rotation + Math.PI / 2) * (180 / Math.PI);
  const angleSpread = UNIFIED_EMITTER_CONFIG.angleSpread * (0.7 + speedIntensity * 0.5);

  // Update each emitter with the same symmetric behavior
  const emitters = [
    { emitter: ship.wakeEmitters.front, position: EMITTER_POSITIONS.FRONT },
    { emitter: ship.wakeEmitters.middle, position: EMITTER_POSITIONS.MIDDLE },
  ];

  emitters.forEach(({ emitter, position }) => {
    // Calculate rotated position
    const pos = calculateRotatedPosition(ship, position);
    emitter.setPosition(pos.x, pos.y);

    if (isMoving) {
      if (!emitter.on) {
        emitter.start();
      }

      // Adjust frequency based on speed (faster = more particles)
      emitter.frequency = Math.max(40, UNIFIED_EMITTER_CONFIG.frequency - speedIntensity * 40);

      // Vary quantity based on speed
      const speedMultiplier = 0.5 + speedIntensity * 0.5;
      emitter.setQuantity(Math.ceil(UNIFIED_EMITTER_CONFIG.quantity * speedMultiplier));

      // Update emission angle to emit backward
      emitter.setAngle({
        min: shipAngleDegrees - angleSpread,
        max: shipAngleDegrees + angleSpread
      });

      // Speed-based lifespan variation
      const lifespanMultiplier = 1 + speedIntensity * 0.5;
      emitter.setLifespan({
        min: UNIFIED_EMITTER_CONFIG.lifespan.min * lifespanMultiplier,
        max: UNIFIED_EMITTER_CONFIG.lifespan.max * lifespanMultiplier
      });
    } else {
      if (emitter.on) {
        emitter.stop();
      }
    }
  });
}

/**
 * Remove and cleanup all wake emitters from a ship
 * @param {Phaser.GameObjects.Sprite} ship - The ship object
 */
function removeShipWakeEmitters(ship) {
  if (ship.wakeEmitters) {
    Object.values(ship.wakeEmitters).forEach(emitter => {
      emitter.stop();
      emitter.remove();
    });
    ship.wakeEmitters = null;
  }
}
