/**
 * Crow's Nest System (Cofa/Carajo)
 *
 * Manages crow's nest interaction for better visibility.
 * Handles proximity detection and climb/descend toggle.
 * Follows Single Responsibility Principle.
 */

class CrowsNestSystem {
    constructor(scene) {
        this.scene = scene;
        this.crowsNestOffset = 60; // Between lantern (0) and anchor (115)
        this.interactionDistance = 15;
        this.indicator = null;
        this.visual = null;
    }

    /**
     * Get crow's nest position in world coordinates
     * @param {Object} ship - Ship sprite
     * @returns {{x: number, y: number}}
     */
    getCrowsNestPosition(ship) {
        const angle = ship.rotation - Math.PI / 2;
        return {
            x: ship.x + Math.cos(angle) * this.crowsNestOffset,
            y: ship.y + Math.sin(angle) * this.crowsNestOffset
        };
    }

    /**
     * Check if player is near crow's nest
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @returns {boolean}
     */
    isNearCrowsNest(player, ship) {
        const crowsNestPos = this.getCrowsNestPosition(ship);
        const distance = Phaser.Math.Distance.Between(
            player.x, player.y,
            crowsNestPos.x, crowsNestPos.y
        );
        return distance < this.interactionDistance;
    }

    /**
     * Create crow's nest visual on ship
     * @param {Object} ship - Ship sprite
     * @returns {Object} Graphics object
     */
    createVisual(ship) {
        if (this.visual) {
            return this.visual;
        }

        const graphics = this.scene.add.graphics();
        graphics.fillStyle(0x2B1810, 1); // Dark brown
        graphics.fillRect(-11, -11, 22, 22);
        graphics.setDepth(3.5); // Above walking player (3), below player in crow's nest (4)

        this.visual = graphics;
        return this.visual;
    }

    /**
     * Update crow's nest visual position and rotation
     * @param {Object} ship - Ship sprite
     */
    updateVisual(ship) {
        if (!this.visual || !ship) return;

        const pos = this.getCrowsNestPosition(ship);
        this.visual.setPosition(pos.x, pos.y);
        this.visual.setRotation(ship.rotation);
    }

    /**
     * Create or get crow's nest indicator
     * @returns {Object} Text object
     */
    getIndicator() {
        if (!this.indicator) {
            this.indicator = this.scene.add.text(0, 0, '', {
                fontSize: '12px',
                fill: '#ffffff',
                backgroundColor: '#000000',
                padding: { x: 5, y: 3 }
            }).setDepth(10).setOrigin(0.5);
        }
        return this.indicator;
    }

    /**
     * Update crow's nest indicator
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     */
    updateIndicator(player, ship) {
        const indicator = this.getIndicator();
        const canUseCrowsNest = this.isNearCrowsNest(player, ship);

        if (canUseCrowsNest && !player.isControllingShip && !player.isOnCannon) {
            const crowsNestPos = this.getCrowsNestPosition(ship);
            const text = 'Presiona E para subir a la cofa';

            if(!player.isInCrowsNest) {
                indicator.setText(text);
                indicator.setPosition(crowsNestPos.x, crowsNestPos.y - 20);
                indicator.setVisible(true);
            } else {
                indicator.setVisible(false);
            }

        } else {
            indicator.setVisible(false);
        }
    }

    /**
     * Toggle crow's nest state
     * @param {Object} player - Player sprite
     * @returns {boolean} New crow's nest state
     */
    toggleCrowsNest(player) {
        player.isInCrowsNest = !player.isInCrowsNest;

        // Emit crow's nest state to server
        if (this.scene.socket) {
            this.scene.socket.emit('crowsNestToggle', { isInCrowsNest: player.isInCrowsNest });
        }

        return player.isInCrowsNest;
    }

    /**
     * Update crow's nest system
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {boolean} interactPressed - Was interact key pressed
     * @param {boolean} nearHelm - Is player near helm (to avoid conflicts)
     * @param {boolean} nearAnchor - Is player near anchor (to avoid conflicts)
     */
    update(player, ship, interactPressed, nearHelm = false, nearAnchor = false) {
        // Update visual position
        this.updateVisual(ship);

        // Update indicator
        this.updateIndicator(player, ship);

        // Only toggle if near crow's nest, not controlling/on cannon, not near other interactions
        if (interactPressed &&
            this.isNearCrowsNest(player, ship) &&
            !nearHelm &&
            !nearAnchor &&
            !player.isControllingShip &&
            !player.isOnCannon) {
            this.toggleCrowsNest(player);
        }
    }
}
