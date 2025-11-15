/**
 * Shared Player Physics Module
 *
 * Pure functions for player physics calculations.
 * No Phaser dependencies - can be used on both client and server.
 * Follows SOLID, DRY, KISS principles.
 */

// Player constants
const PLAYER_CONSTANTS = {
    PLAYER_SPEED: 100,
    SHIP_BOUNDS_WIDTH: 178 - 45,
    SHIP_BOUNDS_HEIGHT: 463 - 200,
    SHIP_BOUNDS_OFFSET_X: 12,
    SHIP_BOUNDS_OFFSET_Y: 7.5,
    DIAGONAL_NORMALIZATION: 0.707, // 1/sqrt(2)
    HELM_OFFSET: 125,
    CANNON_OFFSET: 35
};

/**
 * Convert world velocity to local (ship-relative) velocity
 * @param {number} worldVelX - Velocity in world X
 * @param {number} worldVelY - Velocity in world Y
 * @param {number} shipRotation - Ship rotation in radians
 * @returns {{x: number, y: number}} Local velocity
 */
function worldToLocalVelocity(worldVelX, worldVelY, shipRotation) {
    const cosAngle = Math.cos(-shipRotation);
    const sinAngle = Math.sin(-shipRotation);

    return {
        x: worldVelX * cosAngle - worldVelY * sinAngle,
        y: worldVelX * sinAngle + worldVelY * cosAngle
    };
}

/**
 * Convert local (ship-relative) position to world position
 * @param {number} localX - Local X coordinate
 * @param {number} localY - Local Y coordinate
 * @param {number} shipX - Ship world X
 * @param {number} shipY - Ship world Y
 * @param {number} shipRotation - Ship rotation in radians
 * @returns {{x: number, y: number}} World position
 */
function localToWorldPosition(localX, localY, shipX, shipY, shipRotation) {
    const cosAngle = Math.cos(shipRotation);
    const sinAngle = Math.sin(shipRotation);

    const worldX = localX * cosAngle - localY * sinAngle;
    const worldY = localX * sinAngle + localY * cosAngle;

    return {
        x: shipX + worldX,
        y: shipY + worldY
    };
}

/**
 * Calculate player movement direction and rotation from input
 * @param {Object} input - {up, down, left, right}
 * @returns {{velX: number, velY: number, rotation: number|null, isMoving: boolean}}
 */
function calculatePlayerMovement(input) {
    let worldVelX = 0;
    let worldVelY = 0;

    if (input.up) worldVelY -= PLAYER_CONSTANTS.PLAYER_SPEED;
    if (input.down) worldVelY += PLAYER_CONSTANTS.PLAYER_SPEED;
    if (input.left) worldVelX -= PLAYER_CONSTANTS.PLAYER_SPEED;
    if (input.right) worldVelX += PLAYER_CONSTANTS.PLAYER_SPEED;

    // Normalize diagonal movement
    if (worldVelX !== 0 && worldVelY !== 0) {
        worldVelX *= PLAYER_CONSTANTS.DIAGONAL_NORMALIZATION;
        worldVelY *= PLAYER_CONSTANTS.DIAGONAL_NORMALIZATION;
    }

    const isMoving = (worldVelX !== 0 || worldVelY !== 0);

    // Calculate rotation based on input direction
    let rotation = null;
    if (isMoving) {
        const directionAngles = {
            "up": Math.PI,
            "down": 0,
            "left": Math.PI / 2,
            "right": -Math.PI / 2,
            "up-left": (3 * Math.PI) / 4,
            "up-right": -(3 * Math.PI) / 4,
            "down-left": Math.PI / 4,
            "down-right": -Math.PI / 4
        };

        let combo = "";
        if (input.up) combo += "up";
        if (input.down) combo += "down";
        if (input.left) combo += (combo ? "-" : "") + "left";
        if (input.right) combo += (combo ? "-" : "") + "right";

        rotation = directionAngles[combo];
    }

    return {
        velX: worldVelX,
        velY: worldVelY,
        rotation,
        isMoving
    };
}

/**
 * Clamp player position to ship bounds
 * @param {number} localX - Local X coordinate
 * @param {number} localY - Local Y coordinate
 * @returns {{x: number, y: number}} Clamped local position
 */
function clampToShipBounds(localX, localY) {
    const maxX = PLAYER_CONSTANTS.SHIP_BOUNDS_WIDTH / 2 - PLAYER_CONSTANTS.SHIP_BOUNDS_OFFSET_X;
    const maxY = PLAYER_CONSTANTS.SHIP_BOUNDS_HEIGHT / 2 - PLAYER_CONSTANTS.SHIP_BOUNDS_OFFSET_Y;

    return {
        x: clamp(localX, -maxX, maxX),
        y: clamp(localY, -maxY, maxY)
    };
}

/**
 * Update player state when walking on ship
 * @param {Object} state - Current player state {localX, localY, lastRotation}
 * @param {Object} input - Player input {up, down, left, right}
 * @param {number} shipRotation - Ship rotation in radians
 * @param {number} deltaTime - Time step in seconds
 * @returns {Object} New player state
 */
function updatePlayerOnShip(state, input, shipRotation, deltaTime) {
    // Calculate movement
    const movement = calculatePlayerMovement(input);

    // Convert world velocity to local
    const localVel = worldToLocalVelocity(movement.velX, movement.velY, shipRotation);

    // Update local position
    let newLocalX = state.localX + localVel.x * deltaTime;
    let newLocalY = state.localY + localVel.y * deltaTime;

    // Clamp to ship bounds
    const clamped = clampToShipBounds(newLocalX, newLocalY);
    newLocalX = clamped.x;
    newLocalY = clamped.y;

    // Update rotation if moving
    const newRotation = movement.isMoving && movement.rotation !== null
        ? movement.rotation
        : state.lastRotation;

    return {
        localX: newLocalX,
        localY: newLocalY,
        lastRotation: newRotation,
        isMoving: movement.isMoving
    };
}

/**
 * Get helm position in local coordinates
 * @returns {{x: number, y: number}} Helm local position
 */
function getHelmPosition() {
    return {
        x: 0,
        y: PLAYER_CONSTANTS.HELM_OFFSET
    };
}

/**
 * Utility: Clamp a value between min and max
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Export for Node.js (server) and browser (client)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PLAYER_CONSTANTS,
        worldToLocalVelocity,
        localToWorldPosition,
        calculatePlayerMovement,
        clampToShipBounds,
        updatePlayerOnShip,
        getHelmPosition,
        clamp
    };
}
