/**
 * Input System
 *
 * Handles keyboard and mouse input processing.
 * Separates input handling from game logic.
 * Follows SOLID principles.
 */

class InputSystem {
    constructor(scene) {
        this.scene = scene;
        this.keys = {};
        this.setupKeys();
    }

    /**
     * Setup keyboard keys
     */
    setupKeys() {
        const keyboard = this.scene.input.keyboard;
        this.keys = {
            W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            E: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
            LEFT: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            RIGHT: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            PLUS: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
            MINUS: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
            M: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M),
            SPACE: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
        };
    }

    /**
     * Get current input state
     * @param {boolean} enabled - Is input enabled
     * @returns {Object} Input state
     */
    getInputState(enabled = true) {
        if (!enabled) {
            return {
                movement: { up: false, down: false, left: false, right: false },
                steering: { left: false, right: false },
                interact: false,
                fire: false,
                map: false,
                zoomIn: false,
                zoomOut: false
            };
        }

        return {
            // Player movement (WASD)
            movement: {
                up: this.keys.W.isDown,
                down: this.keys.S.isDown,
                left: this.keys.A.isDown,
                right: this.keys.D.isDown
            },
            // Ship steering (A/D when on helm)
            steering: {
                left: this.keys.A.isDown,
                right: this.keys.D.isDown
            },
            // Interaction (E)
            interact: Phaser.Input.Keyboard.JustDown(this.keys.E),
            // Cannon fire (SPACE)
            fire: Phaser.Input.Keyboard.JustDown(this.keys.SPACE),
            // Cannon aim (LEFT/RIGHT)
            aim: {
                left: this.keys.LEFT.isDown,
                right: this.keys.RIGHT.isDown
            },
            // Map toggle (M)
            map: Phaser.Input.Keyboard.JustDown(this.keys.M),
            // Zoom (+/-)
            zoomIn: Phaser.Input.Keyboard.JustDown(this.keys.PLUS),
            zoomOut: Phaser.Input.Keyboard.JustDown(this.keys.MINUS)
        };
    }

    /**
     * Get player movement input for physics
     * @returns {{up: boolean, down: boolean, left: boolean, right: boolean}}
     */
    getMovementInput() {
        return {
            up: this.keys.W.isDown,
            down: this.keys.S.isDown,
            left: this.keys.A.isDown,
            right: this.keys.D.isDown
        };
    }

    /**
     * Get ship steering input
     * @returns {{turnLeft: boolean, turnRight: boolean}}
     */
    getSteeringInput() {
        return {
            turnLeft: this.keys.A.isDown,
            turnRight: this.keys.D.isDown
        };
    }

    /**
     * Check if interact key was just pressed
     * @returns {boolean}
     */
    isInteractPressed() {
        return Phaser.Input.Keyboard.JustDown(this.keys.E);
    }

    /**
     * Check if fire key was just pressed
     * @returns {boolean}
     */
    isFirePressed() {
        return Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
    }

    /**
     * Get cannon aim input
     * @returns {{left: boolean, right: boolean}}
     */
    getAimInput() {
        return {
            left: this.keys.LEFT.isDown,
            right: this.keys.RIGHT.isDown
        };
    }

    /**
     * Setup mouse wheel for zoom
     * @param {Function} callback - Callback(deltaZoom)
     */
    setupMouseWheel(callback) {
        this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            callback(deltaY);
        });
    }
}
