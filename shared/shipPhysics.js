/**
 * Shared Ship Physics Module
 *
 * Pure functions for ship physics calculations.
 * No Phaser dependencies - can be used on both client and server.
 * Follows SOLID, DRY, KISS principles.
 */

// Physics constants
const SHIP_CONSTANTS = {
    CONSTANT_SPEED: 100,
    TURN_SPEED: 0.1,
    MAX_STEERING_DIRECTION: 100,
    STEERING_INCREMENT: 1,
    STEERING_AUTO_CENTER_THRESHOLD: 5,
    ANCHOR_DECELERATION_FACTOR: 0.995,
    ACCELERATION_FACTOR: 0.003,
    ANCHOR_ANGULAR_DAMPING: 0.995
};

/**
 * Calculate new steering direction based on input
 * @param {number} currentSteering - Current steering direction (-100 to 100)
 * @param {boolean} turnLeft - Is turning left (A key)
 * @param {boolean} turnRight - Is turning right (D key)
 * @returns {number} New steering direction
 */
function calculateSteering(currentSteering, turnLeft, turnRight) {
    let newSteering = currentSteering;

    if (turnLeft) {
        newSteering = clamp(
            newSteering - SHIP_CONSTANTS.STEERING_INCREMENT,
            -SHIP_CONSTANTS.MAX_STEERING_DIRECTION,
            SHIP_CONSTANTS.MAX_STEERING_DIRECTION
        );
    } else if (turnRight) {
        newSteering = clamp(
            newSteering + SHIP_CONSTANTS.STEERING_INCREMENT,
            -SHIP_CONSTANTS.MAX_STEERING_DIRECTION,
            SHIP_CONSTANTS.MAX_STEERING_DIRECTION
        );
    }

    // Auto-center when close to center and no input
    if (Math.abs(newSteering) <= SHIP_CONSTANTS.STEERING_AUTO_CENTER_THRESHOLD &&
        !turnLeft && !turnRight) {
        newSteering = 0;
    }

    return newSteering;
}

/**
 * Calculate angular velocity based on steering direction
 * @param {number} steeringDirection - Current steering direction (-100 to 100)
 * @param {boolean} isAnchored - Is anchor down
 * @returns {number} Angular velocity in radians
 */
function calculateAngularVelocity(steeringDirection, isAnchored) {
    const baseAngularVelocity =
        (steeringDirection / SHIP_CONSTANTS.MAX_STEERING_DIRECTION) *
        SHIP_CONSTANTS.TURN_SPEED;

    if (isAnchored) {
        return baseAngularVelocity * SHIP_CONSTANTS.ANCHOR_ANGULAR_DAMPING;
    }

    return baseAngularVelocity;
}

/**
 * Calculate ship speed with gradual acceleration/deceleration
 * @param {number} currentSpeed - Current ship speed
 * @param {boolean} isAnchored - Is anchor down
 * @returns {number} New ship speed
 */
function calculateSpeed(currentSpeed, isAnchored) {
    if (isAnchored) {
        // Gradual deceleration to 0
        return currentSpeed * SHIP_CONSTANTS.ANCHOR_DECELERATION_FACTOR;
    } else {
        // Gradual acceleration to constant speed
        return currentSpeed +
            (SHIP_CONSTANTS.CONSTANT_SPEED - currentSpeed) *
            SHIP_CONSTANTS.ACCELERATION_FACTOR;
    }
}

/**
 * Calculate ship velocity vector based on rotation and speed
 * @param {number} rotation - Ship rotation in radians
 * @param {number} speed - Ship speed
 * @returns {{x: number, y: number}} Velocity vector
 */
function calculateVelocity(rotation, speed) {
    const shipAngle = rotation - Math.PI / 2;

    return {
        x: Math.cos(shipAngle) * speed,
        y: Math.sin(shipAngle) * speed
    };
}

/**
 * Update ship state (complete physics step)
 * @param {Object} state - Current ship state
 * @param {Object} input - Player input {turnLeft, turnRight}
 * @param {number} deltaTime - Time step in seconds
 * @param {Object} modifiers - Optional modifiers {speed: boolean, turning: boolean}
 * @returns {Object} New ship state
 */
function updateShipPhysics(state, input, deltaTime = 1/60, modifiers = null) {
    // Apply modifiers to constants if provided
    let SPEED_MULTIPLIER = 1.0;
    let TURN_MULTIPLIER = 1.0;

    if (modifiers) {
        // Use actual bonus values from modifiers (bonus = 0.4 means +40%, so multiply by 1.4)
        if (modifiers.speed) SPEED_MULTIPLIER = 1 + (modifiers.speedBonus || 0.2);
        if (modifiers.turning) TURN_MULTIPLIER = 1 + (modifiers.turningBonus || 0.25);
    }

    // Calculate new steering
    const newSteering = calculateSteering(
        state.steeringDirection,
        input.turnLeft,
        input.turnRight
    );

    // Calculate angular velocity with modifier
    const baseAngularVelocity =
        (newSteering / SHIP_CONSTANTS.MAX_STEERING_DIRECTION) *
        SHIP_CONSTANTS.TURN_SPEED * TURN_MULTIPLIER; // Apply turning modifier here

    const angularVelocity = state.isAnchored
        ? baseAngularVelocity * SHIP_CONSTANTS.ANCHOR_ANGULAR_DAMPING
        : baseAngularVelocity;

    // Calculate new rotation
    const newRotation = state.rotation + angularVelocity * deltaTime;

    // Calculate new speed with modifier
    const targetSpeed = SHIP_CONSTANTS.CONSTANT_SPEED * SPEED_MULTIPLIER; // Apply speed modifier here
    const newSpeed = state.isAnchored
        ? state.currentSpeed * SHIP_CONSTANTS.ANCHOR_DECELERATION_FACTOR
        : state.currentSpeed + (targetSpeed - state.currentSpeed) * SHIP_CONSTANTS.ACCELERATION_FACTOR;

    // Calculate velocity
    const velocity = calculateVelocity(newRotation, newSpeed);

    // Calculate new position
    const newX = state.x + velocity.x * deltaTime;
    const newY = state.y + velocity.y * deltaTime;

    return {
        x: newX,
        y: newY,
        rotation: newRotation,
        steeringDirection: newSteering,
        currentSpeed: newSpeed,
        isAnchored: state.isAnchored,
        velocityX: velocity.x,
        velocityY: velocity.y,
        angularVelocity: angularVelocity
    };
}

/**
 * Utility: Clamp a value between min and max
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Utility: Normalize a 2D vector
 */
function normalize(x, y) {
    const length = Math.sqrt(x * x + y * y);
    if (length === 0) return { x: 0, y: 0 };
    return { x: x / length, y: y / length };
}

// Export for Node.js (server) and browser (client)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SHIP_CONSTANTS,
        calculateSteering,
        calculateAngularVelocity,
        calculateSpeed,
        calculateVelocity,
        updateShipPhysics,
        clamp,
        normalize
    };
}
