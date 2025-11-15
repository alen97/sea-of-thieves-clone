/**
 * Helm System
 *
 * Manages helm interaction (ship steering control).
 * Handles helm proximity detection and control toggle.
 * Follows Single Responsibility Principle.
 */

class HelmSystem {
    constructor(scene) {
        this.scene = scene;
        this.helmOffset = 125;
        this.interactionDistance = 15;
        this.indicator = null;
    }

    /**
     * Get helm position in world coordinates
     * @param {Object} ship - Ship sprite
     * @returns {{x: number, y: number}}
     */
    getHelmPosition(ship) {
        const angle = ship.rotation - Math.PI / 2;
        return {
            x: ship.x - Math.cos(angle) * this.helmOffset,
            y: ship.y - Math.sin(angle) * this.helmOffset
        };
    }

    /**
     * Check if player is near helm
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @returns {boolean}
     */
    isNearHelm(player, ship) {
        const helmPos = this.getHelmPosition(ship);
        const distance = Phaser.Math.Distance.Between(
            player.x, player.y,
            helmPos.x, helmPos.y
        );
        return distance < this.interactionDistance;
    }

    /**
     * Create or get helm indicator
     * @returns {Object} Text object
     */
    getIndicator() {
        if (!this.indicator) {
            this.indicator = this.scene.add.text(0, 0, 'Presiona E para manejar', {
                fontSize: '12px',
                fill: '#ffffff',
                backgroundColor: '#000000',
                padding: { x: 5, y: 3 }
            }).setDepth(10).setOrigin(0.5);
        }
        return this.indicator;
    }

    /**
     * Update helm indicator
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     */
    updateIndicator(player, ship) {
        const indicator = this.getIndicator();
        const canUseHelm = this.isNearHelm(player, ship);

        if (canUseHelm && !player.isControllingShip) {
            const helmPos = this.getHelmPosition(ship);
            indicator.setPosition(helmPos.x, helmPos.y - 20);
            indicator.setVisible(true);
        } else {
            indicator.setVisible(false);
        }
    }

    /**
     * Toggle helm control
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @returns {boolean} New control state
     */
    toggleControl(player, ship) {
        if (!this.isNearHelm(player, ship)) {
            return player.isControllingShip;
        }

        player.isControllingShip = !player.isControllingShip;

        // Update camera focus
        if (player.isControllingShip) {
            this.scene.cameras.main.startFollow(ship, 1, 1);
        } else {
            this.scene.cameras.main.startFollow(player, 1, 1);
        }

        return player.isControllingShip;
    }

    /**
     * Update helm system
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {boolean} interactPressed - Was interact key pressed
     */
    update(player, ship, interactPressed) {
        this.updateIndicator(player, ship);

        if (interactPressed) {
            this.toggleControl(player, ship);
        }
    }
}
