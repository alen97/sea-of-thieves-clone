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

        // Create sprite using the crow's nest image
        const crowsNestSprite = this.scene.add.sprite(0, 0, 'crowsNest');

        // Scale to maintain the same size as the old square (22x22)
        const targetSize = 22; // Same size as old square
        const scale = targetSize / Math.max(crowsNestSprite.width, crowsNestSprite.height);
        crowsNestSprite.setScale(scale);

        crowsNestSprite.setDepth(3.5); // Above walking player (3), below player in crow's nest (4)

        this.visual = crowsNestSprite;
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
     * Check if another player is in the crow's nest
     * @param {Object} otherPlayers - Phaser group of other players
     * @returns {boolean}
     */
    isOccupiedByOther(otherPlayers) {
        if (!otherPlayers) return false;

        const others = otherPlayers.getChildren();
        for (let i = 0; i < others.length; i++) {
            if (others[i].isInCrowsNest) {
                return true;
            }
        }
        return false;
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
     * @param {Object} otherPlayers - Phaser group of other players
     */
    updateIndicator(player, ship, otherPlayers) {
        const indicator = this.getIndicator();
        const canUseCrowsNest = this.isNearCrowsNest(player, ship);
        const occupiedByOther = this.isOccupiedByOther(otherPlayers);

        if (canUseCrowsNest && !player.isControllingShip && !occupiedByOther) {
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
     * @param {Object} otherPlayers - Phaser group of other players
     * @returns {boolean} New crow's nest state
     */
    toggleCrowsNest(player, otherPlayers) {
        // Don't allow entering if another player is in crow's nest
        if (!player.isInCrowsNest && this.isOccupiedByOther(otherPlayers)) {
            return player.isInCrowsNest;
        }

        player.isInCrowsNest = !player.isInCrowsNest;

        // Reset camera offset when descending from crow's nest
        if (!player.isInCrowsNest) {
            player.crowsNestCameraOffsetX = 0;
            player.crowsNestCameraOffsetY = 0;
            player.crowsNestCameraManualControl = false;

            // Reactivate camera follow when leaving crow's nest
            if (this.scene.cameras && this.scene.cameras.main) {
                this.scene.cameras.main.startFollow(player, 1, 1);
            }
        }

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
     * @param {Object} otherPlayers - Phaser group of other players
     */
    update(player, ship, interactPressed, nearHelm = false, nearAnchor = false, otherPlayers = null) {
        // Update visual position
        this.updateVisual(ship);

        // Update indicator
        this.updateIndicator(player, ship, otherPlayers);

        // Only toggle if near crow's nest, not controlling, not near other interactions
        if (interactPressed &&
            this.isNearCrowsNest(player, ship) &&
            !nearHelm &&
            !nearAnchor &&
            !player.isControllingShip) {
            this.toggleCrowsNest(player, otherPlayers);
        }
    }
}
