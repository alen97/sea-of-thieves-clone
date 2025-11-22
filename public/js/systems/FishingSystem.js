/**
 * Fishing System
 *
 * Manages fishing rod interaction and mounting.
 * Players can mount fishing rods on the ship sides.
 * Follows Single Responsibility Principle.
 */

class FishingSystem {
    constructor(scene) {
        this.scene = scene;
        this.rodOffset = 75;
        this.interactionDistance = 30;
        this.indicator = null;
    }

    /**
     * Create fishing rods for ship
     * @param {Object} ship - Ship sprite
     * @returns {Object} Fishing rods {left, right}
     */
    createFishingRods(ship) {
        const fishingRods = {
            left: this.createFishingRod('left'),
            right: this.createFishingRod('right')
        };

        return fishingRods;
    }

    /**
     * Create a single fishing rod sprite
     * @param {string} side - 'left' or 'right'
     * @returns {Object} Fishing rod sprite
     */
    createFishingRod(side) {
        const rod = this.scene.add.sprite(0, 0, 'fishing_rod')
            .setOrigin(0.5, 0.5)
            .setDisplaySize(60, 20)
            .setDepth(2.5);

        rod.side = side;

        return rod;
    }

    /**
     * Update fishing rod position based on ship
     * @param {Object} rod - Fishing rod sprite
     * @param {Object} ship - Ship sprite
     */
    updateRodPosition(rod, ship) {
        if (!rod || !ship) return;

        const shipAngle = ship.rotation - Math.PI / 2;

        if (rod.side === 'left') {
            rod.x = ship.x + Math.cos(shipAngle - Math.PI / 2) * this.rodOffset;
            rod.y = ship.y + Math.sin(shipAngle - Math.PI / 2) * this.rodOffset;
            rod.rotation = ship.rotation + Math.PI;
        } else if (rod.side === 'right') {
            rod.x = ship.x + Math.cos(shipAngle + Math.PI / 2) * this.rodOffset;
            rod.y = ship.y + Math.sin(shipAngle + Math.PI / 2) * this.rodOffset;
            rod.rotation = ship.rotation;
        }
    }

    /**
     * Check if player is near fishing rod
     * @param {Object} player - Player sprite
     * @param {Object} rod - Fishing rod sprite
     * @returns {boolean}
     */
    isNearRod(player, rod) {
        if (!player || !rod) return false;

        const distance = Phaser.Math.Distance.Between(
            player.x, player.y,
            rod.x, rod.y
        );

        return distance < this.interactionDistance;
    }

    /**
     * Check if another player is using a specific fishing rod
     * @param {Object} otherPlayers - Phaser group of other players
     * @param {string} side - 'left' or 'right'
     * @returns {boolean}
     */
    isRodOccupiedByOther(otherPlayers, side) {
        if (!otherPlayers) return false;

        const others = otherPlayers.getChildren();
        for (let i = 0; i < others.length; i++) {
            if (others[i].isFishing && others[i].fishingSide === side) {
                return true;
            }
        }
        return false;
    }

    /**
     * Mount player on fishing rod
     * @param {Object} player - Player sprite
     * @param {Object} rod - Fishing rod sprite
     */
    mountRod(player, rod) {
        player.isFishing = true;
        player.fishingSide = rod.side;
        player.canMove = false;

        // Emit fishing state to server
        if (this.scene.socket) {
            this.scene.socket.emit('fishingToggle', {
                isFishing: true,
                fishingSide: rod.side
            });
        }
    }

    /**
     * Dismount player from fishing rod
     * @param {Object} player - Player sprite
     */
    dismountRod(player) {
        player.isFishing = false;
        player.fishingSide = null;
        player.canMove = true;

        // Emit fishing state to server
        if (this.scene.socket) {
            this.scene.socket.emit('fishingToggle', {
                isFishing: false,
                fishingSide: null
            });
        }
    }

    /**
     * Get or create fishing indicator
     * @returns {Object} Text sprite
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
     * Update fishing indicator
     * @param {Object} player - Player sprite
     * @param {Object} fishingRods - {left, right}
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearAnchor - Is player near anchor
     * @param {Object} otherPlayers - Phaser group of other players
     */
    updateIndicator(player, fishingRods, nearHelm, nearAnchor, otherPlayers = null) {
        const indicator = this.getIndicator();

        if (player.isFishing) {
            // Show fishing status
            const rod = player.fishingSide === 'left' ? fishingRods.left : fishingRods.right;
            indicator.setText('Pescando... (E para salir)');
            indicator.setPosition(rod.x, rod.y - 30);
            indicator.setVisible(true);
        } else {
            // Not mounted: show mount prompt if near rod
            const nearLeft = this.isNearRod(player, fishingRods.left);
            const nearRight = this.isNearRod(player, fishingRods.right);
            const leftOccupied = this.isRodOccupiedByOther(otherPlayers, 'left');
            const rightOccupied = this.isRodOccupiedByOther(otherPlayers, 'right');

            if (nearLeft && !nearHelm && !nearAnchor && !leftOccupied) {
                indicator.setText('Presiona E para pescar');
                indicator.setPosition(fishingRods.left.x, fishingRods.left.y - 20);
                indicator.setVisible(true);
            } else if (nearRight && !nearHelm && !nearAnchor && !rightOccupied) {
                indicator.setText('Presiona E para pescar');
                indicator.setPosition(fishingRods.right.x, fishingRods.right.y - 20);
                indicator.setVisible(true);
            } else {
                indicator.setVisible(false);
            }
        }
    }

    /**
     * Handle fishing interaction
     * @param {Object} player - Player sprite
     * @param {Object} fishingRods - {left, right}
     * @param {boolean} interactPressed - Was interact pressed
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearAnchor - Is player near anchor
     * @param {Object} otherPlayers - Phaser group of other players
     */
    handleInteraction(player, fishingRods, interactPressed, nearHelm, nearAnchor, otherPlayers) {
        if (!interactPressed) return;

        if (player.isFishing) {
            // Dismount
            this.dismountRod(player);
        } else if (!nearHelm && !nearAnchor) {
            // Try to mount
            if (this.isNearRod(player, fishingRods.left) && !this.isRodOccupiedByOther(otherPlayers, 'left')) {
                this.mountRod(player, fishingRods.left);
            } else if (this.isNearRod(player, fishingRods.right) && !this.isRodOccupiedByOther(otherPlayers, 'right')) {
                this.mountRod(player, fishingRods.right);
            }
        }
    }

    /**
     * Update fishing system
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {Object} fishingRods - {left, right}
     * @param {Object} input - Input state
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearAnchor - Is player near anchor
     * @param {Object} otherPlayers - Phaser group of other players
     */
    update(player, ship, fishingRods, input, nearHelm, nearAnchor, otherPlayers = null) {
        // Update rod positions
        this.updateRodPosition(fishingRods.left, ship);
        this.updateRodPosition(fishingRods.right, ship);

        // Update indicator
        this.updateIndicator(player, fishingRods, nearHelm, nearAnchor, otherPlayers);

        // Handle mount/dismount
        this.handleInteraction(player, fishingRods, input.interact, nearHelm, nearAnchor, otherPlayers);
    }
}
