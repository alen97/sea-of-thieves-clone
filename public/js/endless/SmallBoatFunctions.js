/**
 * Small Boat Functions for Endless Sea of Rooms
 * Handles creation, physics, and rendering of the small single-player boat
 */

// Small boat physics constants
const SMALL_BOAT_CONSTANTS = {
    CONSTANT_SPEED: 80,
    TURN_SPEED: 0.18,
    MAX_STEERING_DIRECTION: 100,
    STEERING_INCREMENT: 1.5,
    STEERING_AUTO_CENTER_THRESHOLD: 5,
    ANCHOR_DECELERATION_FACTOR: 0.99,
    ACCELERATION_FACTOR: 0.005,
    ANCHOR_ANGULAR_DAMPING: 0.99,

    // Dimensions
    WIDTH: 80,
    HEIGHT: 160,

    // Collision
    BODY_WIDTH: 60,
    BODY_HEIGHT: 140
};

/**
 * Create small boat sprite and physics body
 * @param {Phaser.Scene} scene - The game scene
 * @param {number} x - Initial x position
 * @param {number} y - Initial y position
 * @returns {Object} Boat object with sprite and state
 */
function createSmallBoat(scene, x, y) {
    // Create boat sprite
    const sprite = scene.add.sprite(x, y, 'small_boat');
    sprite.setOrigin(0.5, 0.5);

    // Enable physics
    scene.physics.add.existing(sprite);
    sprite.body.setSize(SMALL_BOAT_CONSTANTS.BODY_WIDTH, SMALL_BOAT_CONSTANTS.BODY_HEIGHT);
    sprite.body.setOffset(
        (SMALL_BOAT_CONSTANTS.WIDTH - SMALL_BOAT_CONSTANTS.BODY_WIDTH) / 2,
        (SMALL_BOAT_CONSTANTS.HEIGHT - SMALL_BOAT_CONSTANTS.BODY_HEIGHT) / 2
    );

    // Boat state
    const boat = {
        sprite: sprite,
        state: {
            x: x,
            y: y,
            rotation: 0,
            steeringDirection: 0,
            currentSpeed: 0,
            isAnchored: true,
            velocityX: 0,
            velocityY: 0,
            angularVelocity: 0
        },
        // Equipment positions (relative to boat center)
        rodLeftOffset: { x: -35, y: 0 },
        rodRightOffset: { x: 35, y: 0 },
        hookOffset: { x: 0, y: -70 },
        storageOffset: { x: 0, y: 40 },
        cookingOffset: { x: -20, y: 30 }
    };

    return boat;
}

/**
 * Update small boat physics
 * @param {Object} state - Current boat state
 * @param {Object} input - Player input {turnLeft, turnRight}
 * @param {number} deltaTime - Time step in seconds
 * @returns {Object} New boat state
 */
function updateSmallBoatPhysics(state, input, deltaTime = 1/60) {
    // Calculate new steering
    let newSteering = state.steeringDirection;

    if (input.turnLeft) {
        newSteering = Math.max(
            newSteering - SMALL_BOAT_CONSTANTS.STEERING_INCREMENT,
            -SMALL_BOAT_CONSTANTS.MAX_STEERING_DIRECTION
        );
    } else if (input.turnRight) {
        newSteering = Math.min(
            newSteering + SMALL_BOAT_CONSTANTS.STEERING_INCREMENT,
            SMALL_BOAT_CONSTANTS.MAX_STEERING_DIRECTION
        );
    }

    // Auto-center
    if (Math.abs(newSteering) <= SMALL_BOAT_CONSTANTS.STEERING_AUTO_CENTER_THRESHOLD &&
        !input.turnLeft && !input.turnRight) {
        newSteering = 0;
    }

    // Calculate angular velocity
    const baseAngularVelocity =
        (newSteering / SMALL_BOAT_CONSTANTS.MAX_STEERING_DIRECTION) *
        SMALL_BOAT_CONSTANTS.TURN_SPEED;

    const angularVelocity = state.isAnchored
        ? baseAngularVelocity * SMALL_BOAT_CONSTANTS.ANCHOR_ANGULAR_DAMPING
        : baseAngularVelocity;

    // Calculate new rotation
    let newRotation = state.rotation + angularVelocity * deltaTime;
    while (newRotation > Math.PI) newRotation -= 2 * Math.PI;
    while (newRotation < -Math.PI) newRotation += 2 * Math.PI;

    // Calculate speed
    const newSpeed = state.isAnchored
        ? state.currentSpeed * SMALL_BOAT_CONSTANTS.ANCHOR_DECELERATION_FACTOR
        : state.currentSpeed +
          (SMALL_BOAT_CONSTANTS.CONSTANT_SPEED - state.currentSpeed) *
          SMALL_BOAT_CONSTANTS.ACCELERATION_FACTOR;

    // Calculate velocity
    const shipAngle = newRotation - Math.PI / 2;
    const velocityX = Math.cos(shipAngle) * newSpeed;
    const velocityY = Math.sin(shipAngle) * newSpeed;

    // Calculate new position
    const newX = state.x + velocityX * deltaTime;
    const newY = state.y + velocityY * deltaTime;

    return {
        x: newX,
        y: newY,
        rotation: newRotation,
        steeringDirection: newSteering,
        currentSpeed: newSpeed,
        isAnchored: state.isAnchored,
        velocityX: velocityX,
        velocityY: velocityY,
        angularVelocity: angularVelocity
    };
}

/**
 * Apply state to boat sprite
 * @param {Object} boat - Boat object
 */
function applyBoatState(boat) {
    boat.sprite.x = boat.state.x;
    boat.sprite.y = boat.state.y;
    boat.sprite.rotation = boat.state.rotation;

    if (boat.sprite.body) {
        boat.sprite.body.velocity.x = boat.state.velocityX;
        boat.sprite.body.velocity.y = boat.state.velocityY;
    }
}

/**
 * Get world position of boat equipment
 * @param {Object} boat - Boat object
 * @param {string} equipment - 'rodLeft', 'rodRight', 'hook', 'storage', 'cooking'
 * @returns {{x: number, y: number}} World position
 */
function getEquipmentPosition(boat, equipment) {
    let offset;
    switch (equipment) {
        case 'rodLeft': offset = boat.rodLeftOffset; break;
        case 'rodRight': offset = boat.rodRightOffset; break;
        case 'hook': offset = boat.hookOffset; break;
        case 'storage': offset = boat.storageOffset; break;
        case 'cooking': offset = boat.cookingOffset; break;
        default: return { x: boat.state.x, y: boat.state.y };
    }

    // Rotate offset by boat rotation
    const cos = Math.cos(boat.state.rotation);
    const sin = Math.sin(boat.state.rotation);

    return {
        x: boat.state.x + offset.x * cos - offset.y * sin,
        y: boat.state.y + offset.x * sin + offset.y * cos
    };
}

/**
 * Create wake particle effect behind boat
 * @param {Phaser.Scene} scene - The game scene
 * @param {Object} boat - Boat object
 * @returns {Phaser.GameObjects.Particles.ParticleEmitter} Wake emitter
 */
function createBoatWake(scene, boat) {
    const particles = scene.add.particles(0, 0, 'wake_particle', {
        speed: { min: 20, max: 40 },
        scale: { start: 0.4, end: 0 },
        alpha: { start: 0.6, end: 0 },
        lifespan: 1000,
        frequency: 50,
        quantity: 1,
        angle: { min: -10, max: 10 },
        follow: boat.sprite,
        followOffset: { x: 0, y: 70 }
    });

    return particles;
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SMALL_BOAT_CONSTANTS,
        createSmallBoat,
        updateSmallBoatPhysics,
        applyBoatState,
        getEquipmentPosition,
        createBoatWake
    };
}
