/**
 * EnergySystem - Manages player hunger/energy for survival mechanics
 */
class EnergySystem {
    constructor(scene) {
        this.scene = scene;
        this.maxEnergy = 100;
        this.energyDecayRate = 0.5; // Energy lost per second
        this.lowEnergyThreshold = 30; // Below this, player moves slower
        this.criticalEnergyThreshold = 10; // Below this, severe penalties
        this.lastDecayTime = 0;
        this.decayInterval = 1000; // Decay every second
    }

    /**
     * Initialize energy bar UI for a player
     * @param {Object} player - Player sprite
     */
    initializePlayerEnergy(player) {
        player.energy = this.maxEnergy;
        player.maxEnergy = this.maxEnergy;

        // Create energy bar graphics (will be drawn in updateEnergyBar)
        const barWidth = 30;
        const barHeight = 4;

        player.energyBarBg = this.scene.add.graphics();
        player.energyBarBg.setDepth(11);

        player.energyBar = this.scene.add.graphics();
        player.energyBar.setDepth(11);

        // Store dimensions
        player.energyBarWidth = barWidth;
        player.energyBarHeight = barHeight;
    }

    /**
     * Update energy bar position and fill
     * @param {Object} player - Player sprite
     */
    updateEnergyBar(player) {
        if (!player.energyBarBg || !player.energyBar) return;

        // Position bar above player
        const barX = player.x;
        const barY = player.y - 25;

        // Calculate fill percentage
        const fillPercent = player.energy / player.maxEnergy;
        const fillWidth = player.energyBarWidth * fillPercent;

        // Determine color based on energy level
        let color;
        if (player.energy > this.lowEnergyThreshold) {
            color = 0xFFD700; // Gold - healthy
        } else if (player.energy > this.criticalEnergyThreshold) {
            color = 0xFFA500; // Orange - low
        } else {
            color = 0xFF4500; // Red-orange - critical
        }

        // Redraw background bar at new position
        player.energyBarBg.clear();
        player.energyBarBg.fillStyle(0x000000, 0.7);
        player.energyBarBg.fillRect(
            barX - player.energyBarWidth / 2,
            barY - player.energyBarHeight / 2,
            player.energyBarWidth,
            player.energyBarHeight
        );

        // Redraw fill bar at new position
        player.energyBar.clear();
        player.energyBar.fillStyle(color, 1);
        player.energyBar.fillRect(
            barX - player.energyBarWidth / 2,
            barY - player.energyBarHeight / 2,
            fillWidth,
            player.energyBarHeight
        );
    }

    /**
     * Decay energy over time
     * @param {Object} player - Player sprite
     * @param {number} time - Current game time
     */
    decayEnergy(player, time) {
        if (time - this.lastDecayTime >= this.decayInterval) {
            if (player.energy > 0) {
                player.energy = Math.max(0, player.energy - this.energyDecayRate);
            }
            this.lastDecayTime = time;
        }
    }

    /**
     * Restore energy (e.g., from eating food)
     * @param {Object} player - Player sprite
     * @param {number} amount - Amount to restore
     */
    restoreEnergy(player, amount) {
        player.energy = Math.min(player.maxEnergy, player.energy + amount);
    }

    /**
     * Get movement speed multiplier based on energy
     * @param {Object} player - Player sprite
     * @returns {number} Speed multiplier (0.5 to 1.0)
     */
    getSpeedMultiplier(player) {
        if (player.energy > this.lowEnergyThreshold) {
            return 1.0;
        } else if (player.energy > this.criticalEnergyThreshold) {
            return 0.7; // 30% slower
        } else {
            return 0.5; // 50% slower
        }
    }

    /**
     * Check if player is at critical energy
     * @param {Object} player - Player sprite
     * @returns {boolean}
     */
    isCritical(player) {
        return player.energy <= this.criticalEnergyThreshold;
    }

    /**
     * Check if player is starving (0 energy)
     * @param {Object} player - Player sprite
     * @returns {boolean}
     */
    isStarving(player) {
        return player.energy <= 0;
    }

    /**
     * Main update loop
     * @param {Object} player - Player sprite
     * @param {number} time - Current game time
     */
    update(player, time) {
        if (!player || player.energy === undefined) return;

        // Decay energy over time
        this.decayEnergy(player, time);

        // Update visual
        this.updateEnergyBar(player);
    }

    /**
     * Clean up energy bar graphics
     * @param {Object} player - Player sprite
     */
    destroy(player) {
        if (player.energyBarBg) {
            player.energyBarBg.destroy();
        }
        if (player.energyBar) {
            player.energyBar.destroy();
        }
    }
}
