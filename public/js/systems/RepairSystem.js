/**
 * Repair System
 *
 * Manages ship repair interaction, repair zone, and repair mechanics.
 * Follows Single Responsibility Principle.
 */

class RepairSystem {
    constructor(scene) {
        this.scene = scene;
        this.interactionDistance = 15;
        this.hatchOffsetX = -57; // Slightly to the right of helm
        this.hatchOffsetY = 0; // Below helm
        this.visual = null;
        this.indicator = null;
        this.repairRate = 10; // HP per repair tick
        this.repairInterval = 3000; // 3 seconds per repair tick
        this.repairSound = null; // Repairing sound instance
    }

    /**
     * Start playing the repairing sound in loop
     */
    startRepairSound() {
        if (!this.repairSound) {
            this.repairSound = this.scene.sound.add('repairing', {
                loop: true,
                volume: 0.5
            });
            // Add marker to play only first 10 seconds
            this.repairSound.addMarker({
                name: 'loop10s',
                start: 0,
                duration: 10,
                config: { loop: true }
            });
        }
        if (!this.repairSound.isPlaying) {
            this.repairSound.play('loop10s');
            console.log('[REPAIR] Started repair sound');
        }
    }

    /**
     * Stop playing the repairing sound
     */
    stopRepairSound() {
        if (this.repairSound && this.repairSound.isPlaying) {
            this.repairSound.stop();
            console.log('[REPAIR] Stopped repair sound');
        }
    }

    /**
     * Get repair hatch position (relative to ship position)
     * @param {Object} ship - Ship sprite
     * @returns {Object} {x, y} world coordinates
     */
    getHatchPosition(ship) {
        const angle = ship.rotation - Math.PI / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Rotate the offset based on ship rotation
        const rotatedX = this.hatchOffsetX * cos - this.hatchOffsetY * sin;
        const rotatedY = this.hatchOffsetX * sin + this.hatchOffsetY * cos;

        return {
            x: ship.x + rotatedX,
            y: ship.y + rotatedY
        };
    }

    /**
     * Check if player is near repair hatch
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @returns {boolean}
     */
    isNearHatch(player, ship) {
        const hatchPos = this.getHatchPosition(ship);
        const distance = Phaser.Math.Distance.Between(
            player.x, player.y,
            hatchPos.x, hatchPos.y
        );
        return distance < this.interactionDistance;
    }

    /**
     * Create repair hatch visual on ship
     * @param {Object} ship - Ship sprite
     * @returns {Object} Graphics object
     */
    createVisual(ship) {
        if (this.visual) {
            return this.visual;
        }

        // Create sprite using the hatch image
        const hatchSprite = this.scene.add.sprite(0, 0, 'hatch');

        // Scale to maintain the same size as the old square (30x30)
        // Adjust based on the actual sprite dimensions
        const targetSize = 30; // Same size as old square
        const scale = targetSize / Math.max(hatchSprite.width, hatchSprite.height);
        hatchSprite.setScale(scale);

        hatchSprite.setDepth(2.5); // Same as cannons, above ship (2), below player (3)

        this.visual = hatchSprite;
        return this.visual;
    }

    /**
     * Update repair hatch visual position and rotation
     * @param {Object} ship - Ship sprite
     */
    updateVisual(ship) {
        if (!this.visual || !ship) return;

        const hatchPos = this.getHatchPosition(ship);
        this.visual.setPosition(hatchPos.x, hatchPos.y);
        this.visual.setRotation(ship.rotation); // Rotate with ship
    }

    /**
     * Check if another player is repairing
     * @param {Object} otherPlayers - Phaser group of other players
     * @returns {boolean}
     */
    isOccupiedByOther(otherPlayers) {
        if (!otherPlayers) return false;

        const others = otherPlayers.getChildren();
        for (let i = 0; i < others.length; i++) {
            if (others[i].isRepairing) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get or create repair indicator
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
     * Update repair indicator
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearCannon - Is player near cannon
     * @param {boolean} nearCrowsNest - Is player near crow's nest
     * @param {Object} otherPlayers - Phaser group of other players
     */
    updateIndicator(player, ship, nearHelm, nearCannon, nearCrowsNest, otherPlayers) {
        const indicator = this.getIndicator();
        const occupiedByOther = this.isOccupiedByOther(otherPlayers);

        // If player is repairing, show repair progress
        if (player.isRepairing) {
            const hatchPos = this.getHatchPosition(ship);
            const health = ship.health || 100;
            const maxHealth = ship.maxHealth || 100;
            const healthPercent = Math.round((health / maxHealth) * 100);
            indicator.setText(`Reparando... ${healthPercent}%`);
            indicator.setPosition(hatchPos.x, hatchPos.y - 25);
            indicator.setVisible(true);
            console.log(`[REPAIR DEBUG] Health: ${health}/${maxHealth}, Percent: ${healthPercent}%`);
            return;
        }

        // Don't show repair indicator if player is doing something else or hatch is occupied
        if (nearHelm || nearCannon || nearCrowsNest || occupiedByOther) {
            indicator.setVisible(false);
            return;
        }

        const nearHatch = this.isNearHatch(player, ship);

        if (nearHatch) {
            const hatchPos = this.getHatchPosition(ship);

            // Always show "Presiona E para reparar el barco" when near hatch
            indicator.setText('Presiona E para reparar el barco');
            indicator.setPosition(hatchPos.x, hatchPos.y - 25);
            indicator.setVisible(true);
        } else {
            indicator.setVisible(false);
        }
    }

    /**
     * Handle repair input (toggle E at hatch)
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {boolean} interactPressed - Was E key just pressed (JustDown)
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearCannon - Is player near cannon
     * @param {boolean} nearCrowsNest - Is player near crow's nest
     * @param {Object} socket - Socket instance
     * @param {Object} otherPlayers - Phaser group of other players
     */
    handleRepairInput(player, ship, interactPressed, nearHelm, nearCannon, nearCrowsNest, socket, otherPlayers) {
        // Don't allow repair if player is doing something else
        if (nearHelm || nearCannon || nearCrowsNest) {
            if (player.isRepairing) {
                player.isRepairing = false;
                socket.emit('stopRepair');
            }
            return;
        }

        const nearHatch = this.isNearHatch(player, ship);
        const occupiedByOther = this.isOccupiedByOther(otherPlayers);

        // Stop repairing if player moves away from hatch (only if not already repairing)
        // Note: We don't stop repair on movement since we're locking position
        // We only stop if the player uses another station or presses E again

        // Toggle repair on E press when near hatch
        if (nearHatch && interactPressed) {
            if (!player.isRepairing) {
                // Don't allow starting repair if another player is repairing
                if (occupiedByOther) {
                    console.log('[REPAIR] Cannot repair - another player is repairing');
                    return;
                }

                // Check if ship is at full health
                const health = ship.health || 100;
                const maxHealth = ship.maxHealth || 100;

                if (health >= maxHealth) {
                    console.log('[REPAIR] Cannot repair - ship is at full health');
                    return;
                }

                // Start repairing
                player.isRepairing = true;
                socket.emit('startRepair');
                console.log('[REPAIR] Started repairing ship');
            } else {
                // Stop repairing (toggle off)
                player.isRepairing = false;
                socket.emit('stopRepair');
                console.log('[REPAIR] Stopped repairing ship - toggled off');
            }
        }
    }

    /**
     * Lock player position at hatch when repairing
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     */
    lockPlayerAtHatch(player, ship) {
        if (!player.isRepairing) return;

        const hatchPos = this.getHatchPosition(ship);
        player.setPosition(hatchPos.x, hatchPos.y);
    }

    /**
     * Update repair system
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {Object} inputState - Input state object
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearCannon - Is player near cannon
     * @param {boolean} nearCrowsNest - Is player near crow's nest
     * @param {Object} otherPlayers - Phaser group of other players
     */
    update(player, ship, inputState, nearHelm, nearCannon, nearCrowsNest, otherPlayers) {
        // Update visual position
        this.updateVisual(ship);

        // Lock player at hatch if repairing
        this.lockPlayerAtHatch(player, ship);

        // Auto-stop repairing if ship reaches full health
        if (player.isRepairing) {
            const health = ship.health || 100;
            const maxHealth = ship.maxHealth || 100;

            if (health >= maxHealth) {
                player.isRepairing = false;
                this.scene.socket.emit('stopRepair');
                console.log('[REPAIR] Auto-stopped repair - ship at full health');
            }
        }

        // Update indicator
        this.updateIndicator(player, ship, nearHelm, nearCannon, nearCrowsNest, otherPlayers);

        // Handle repair input
        const interactPressed = inputState.interact || false;
        this.handleRepairInput(player, ship, interactPressed, nearHelm, nearCannon, nearCrowsNest, this.scene.socket, otherPlayers);
    }
}
