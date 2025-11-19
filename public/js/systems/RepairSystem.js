/**
 * Repair System
 *
 * Manages ship repair interaction, repair zone, and repair mechanics.
 * Follows Single Responsibility Principle.
 */

class RepairSystem {
    constructor(scene) {
        this.scene = scene;
        this.interactionDistance = 30;
        this.hatchOffsetX = 40; // Slightly to the right of helm
        this.hatchOffsetY = 50; // Below helm
        this.visual = null;
        this.indicator = null;
        this.repairRate = 10; // HP per repair tick
        this.repairInterval = 3000; // 3 seconds per repair tick
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

        const graphics = this.scene.add.graphics();
        graphics.fillStyle(0x1a1a1a, 1); // Dark gray/black (like crow's nest)
        graphics.fillRect(-15, -15, 30, 30); // Slightly larger than crow's nest
        graphics.setDepth(2.5); // Same as cannons, above ship (2), below player (3)

        this.visual = graphics;
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
     */
    updateIndicator(player, ship, nearHelm, nearCannon, nearCrowsNest) {
        const indicator = this.getIndicator();

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

        // Don't show repair indicator if player is doing something else
        if (nearHelm || nearCannon || nearCrowsNest) {
            indicator.setVisible(false);
            return;
        }

        const nearHatch = this.isNearHatch(player, ship);

        if (nearHatch) {
            const hatchPos = this.getHatchPosition(ship);
            indicator.setText('Presiona E para reparar');
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
     */
    handleRepairInput(player, ship, interactPressed, nearHelm, nearCannon, nearCrowsNest, socket) {
        // Don't allow repair if player is doing something else
        if (nearHelm || nearCannon || nearCrowsNest) {
            if (player.isRepairing) {
                player.isRepairing = false;
                socket.emit('stopRepair');
            }
            return;
        }

        const nearHatch = this.isNearHatch(player, ship);

        // Stop repairing if player moves away from hatch
        if (!nearHatch && player.isRepairing) {
            player.isRepairing = false;
            socket.emit('stopRepair');
            console.log('[REPAIR] Stopped repairing ship - moved away from hatch');
            return;
        }

        // Toggle repair on E press when near hatch
        if (nearHatch && interactPressed) {
            if (!player.isRepairing) {
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
     * Update repair system
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {Object} inputState - Input state object
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearCannon - Is player near cannon
     * @param {boolean} nearCrowsNest - Is player near crow's nest
     */
    update(player, ship, inputState, nearHelm, nearCannon, nearCrowsNest) {
        // Update visual position
        this.updateVisual(ship);

        // Update indicator
        this.updateIndicator(player, ship, nearHelm, nearCannon, nearCrowsNest);

        // Handle repair input (need to check if E is being held)
        const interactHeld = inputState.interact || false;
        this.handleRepairInput(player, ship, interactHeld, nearHelm, nearCannon, nearCrowsNest, this.scene.socket);
    }
}
