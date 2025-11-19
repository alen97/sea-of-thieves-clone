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
     * Check if another player is controlling the ship
     * @param {Object} otherPlayers - Phaser group of other players
     * @returns {boolean}
     */
    isOccupiedByOther(otherPlayers) {
        if (!otherPlayers) return false;

        const others = otherPlayers.getChildren();
        for (let i = 0; i < others.length; i++) {
            if (others[i].isControllingShip) {
                return true;
            }
        }
        return false;
    }

    /**
     * Update helm indicator
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {Object} otherPlayers - Phaser group of other players
     */
    updateIndicator(player, ship, otherPlayers) {
        const indicator = this.getIndicator();
        const canUseHelm = this.isNearHelm(player, ship);
        const occupiedByOther = this.isOccupiedByOther(otherPlayers);

        if (canUseHelm && !player.isControllingShip && !occupiedByOther) {
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
     * @param {Object} otherPlayers - Phaser group of other players
     * @returns {boolean} New control state
     */
    toggleControl(player, ship, otherPlayers) {
        if (!this.isNearHelm(player, ship)) {
            return player.isControllingShip;
        }

        // Don't allow taking control if another player is controlling
        if (!player.isControllingShip && this.isOccupiedByOther(otherPlayers)) {
            return player.isControllingShip;
        }

        player.isControllingShip = !player.isControllingShip;

        // Emit helm state to server
        if (this.scene.socket) {
            this.scene.socket.emit('helmToggle', { isControllingShip: player.isControllingShip });
        }

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
     * @param {Object} otherPlayers - Phaser group of other players
     */
    update(player, ship, interactPressed, otherPlayers) {
        this.updateIndicator(player, ship, otherPlayers);

        if (interactPressed) {
            this.toggleControl(player, ship, otherPlayers);
        }
    }
}
