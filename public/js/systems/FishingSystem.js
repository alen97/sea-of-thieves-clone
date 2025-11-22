/**
 * FishingSystem - Manages fishing mechanics for survival gameplay
 */
class FishingSystem {
    constructor(scene) {
        this.scene = scene;
        this.fishingSpots = [];
        this.interactionRadius = 50;
        this.isFishing = false;
        this.fishingProgress = 0;
        this.fishingDuration = 3000; // 3 seconds to catch
        this.fishingStartTime = 0;
        this.currentSpot = null;
        this.caughtFish = null;

        // Fish types with rarity and energy value
        this.fishTypes = [
            { name: 'Sardina', rarity: 0.5, energy: 15, color: 0xC0C0C0 },
            { name: 'Caballa', rarity: 0.3, energy: 25, color: 0x4169E1 },
            { name: 'Atun', rarity: 0.15, energy: 40, color: 0x191970 },
            { name: 'Pez Dorado', rarity: 0.05, energy: 60, color: 0xFFD700 }
        ];
    }

    /**
     * Create fishing spots on the ship
     * @param {Object} ship - Ship sprite
     */
    createFishingSpots(ship) {
        // Fishing spot at the front of the ship
        const spotPositions = [
            { x: 0, y: -180 }  // Front/bow of ship
        ];

        spotPositions.forEach((pos, index) => {
            const spot = this.createSpot(ship, pos.x, pos.y, index);
            this.fishingSpots.push(spot);
        });

        // Create indicator text
        this.indicator = this.scene.add.text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        });
        this.indicator.setOrigin(0.5);
        this.indicator.setDepth(15);
        this.indicator.setVisible(false);

        // Create fishing progress bar
        this.progressBarBg = this.scene.add.graphics();
        this.progressBarBg.setDepth(15);
        this.progressBarBg.setVisible(false);

        this.progressBar = this.scene.add.graphics();
        this.progressBar.setDepth(15);
        this.progressBar.setVisible(false);

        return this.fishingSpots;
    }

    /**
     * Create a single fishing spot visual
     */
    createSpot(ship, offsetX, offsetY, index) {
        // Visual indicator for fishing spot using container
        const container = this.scene.add.container(0, 0);

        const graphics = this.scene.add.graphics();
        graphics.fillStyle(0x8B4513, 1);
        graphics.fillCircle(0, 0, 8);
        graphics.lineStyle(2, 0x000000);
        graphics.strokeCircle(0, 0, 8);

        container.add(graphics);
        container.setDepth(2.6);

        const spot = {
            container: container,
            offsetX: offsetX,
            offsetY: offsetY,
            index: index
        };

        return spot;
    }

    /**
     * Update fishing spot positions
     */
    updateSpotPositions(ship) {
        this.fishingSpots.forEach(spot => {
            const cos = Math.cos(ship.rotation);
            const sin = Math.sin(ship.rotation);
            const worldX = ship.x + (spot.offsetX * cos - spot.offsetY * sin);
            const worldY = ship.y + (spot.offsetX * sin + spot.offsetY * cos);

            spot.container.setPosition(worldX, worldY);
        });
    }

    /**
     * Get nearest fishing spot to player
     */
    getNearestSpot(player) {
        let nearestSpot = null;
        let nearestDistance = this.interactionRadius;

        this.fishingSpots.forEach(spot => {
            const dx = player.x - spot.container.x;
            const dy = player.y - spot.container.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestSpot = spot;
            }
        });

        return nearestSpot;
    }

    /**
     * Check if player is near fishing spot
     */
    isNearSpot(player) {
        return this.getNearestSpot(player) !== null;
    }

    /**
     * Start fishing
     */
    startFishing(player, spot, time) {
        this.isFishing = true;
        this.fishingStartTime = time;
        this.fishingProgress = 0;
        this.currentSpot = spot;
        player.canMove = false;
    }

    /**
     * Cancel fishing
     */
    cancelFishing(player) {
        this.isFishing = false;
        this.fishingProgress = 0;
        this.currentSpot = null;
        player.canMove = true;
        this.progressBarBg.setVisible(false);
        this.progressBar.setVisible(false);
    }

    /**
     * Complete fishing and determine catch
     */
    completeFishing(player) {
        // Determine fish type based on rarity
        const roll = Math.random();
        let cumulative = 0;
        let caughtType = this.fishTypes[0];

        for (const fishType of this.fishTypes) {
            cumulative += fishType.rarity;
            if (roll <= cumulative) {
                caughtType = fishType;
                break;
            }
        }

        // Create fish object
        this.caughtFish = {
            type: caughtType.name,
            energy: caughtType.energy,
            color: caughtType.color
        };

        console.log(`Caught a ${caughtType.name}! (+${caughtType.energy} energy)`);

        // Reset fishing state
        this.isFishing = false;
        this.fishingProgress = 0;
        this.currentSpot = null;
        player.canMove = true;
        this.progressBarBg.setVisible(false);
        this.progressBar.setVisible(false);

        return this.caughtFish;
    }

    /**
     * Get and clear caught fish
     */
    getCaughtFish() {
        const fish = this.caughtFish;
        this.caughtFish = null;
        return fish;
    }

    /**
     * Update progress bar visual
     */
    updateProgressBar(spot, progress) {
        if (!this.isFishing) return;

        const barWidth = 40;
        const barHeight = 6;
        const x = spot.container.x;
        const y = spot.container.y - 25;

        // Background
        this.progressBarBg.clear();
        this.progressBarBg.fillStyle(0x000000, 0.7);
        this.progressBarBg.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth, barHeight);
        this.progressBarBg.setVisible(true);

        // Progress fill
        const fillWidth = barWidth * progress;
        this.progressBar.clear();
        this.progressBar.fillStyle(0x00FF00, 1);
        this.progressBar.fillRect(x - barWidth / 2, y - barHeight / 2, fillWidth, barHeight);
        this.progressBar.setVisible(true);
    }

    /**
     * Update indicator
     */
    updateIndicator(player) {
        if (this.isFishing) {
            this.indicator.setText('Pescando...\nManten E presionado');
            this.indicator.setPosition(this.currentSpot.container.x, this.currentSpot.container.y - 40);
            this.indicator.setVisible(true);
            return;
        }

        const nearestSpot = this.getNearestSpot(player);

        if (nearestSpot && !player.isControllingShip && !player.isInCrowsNest && !player.isRepairing) {
            this.indicator.setText('Presiona E para pescar');
            this.indicator.setPosition(nearestSpot.container.x, nearestSpot.container.y - 25);
            this.indicator.setVisible(true);
        } else {
            this.indicator.setVisible(false);
        }
    }

    /**
     * Handle fishing input
     * @returns {Object|null} Caught fish if fishing completed
     */
    handleFishingInput(player, interactHeld, time) {
        const nearestSpot = this.getNearestSpot(player);

        if (this.isFishing) {
            if (interactHeld) {
                // Continue fishing
                const elapsed = time - this.fishingStartTime;
                this.fishingProgress = Math.min(1, elapsed / this.fishingDuration);

                this.updateProgressBar(this.currentSpot, this.fishingProgress);

                if (this.fishingProgress >= 1) {
                    return this.completeFishing(player);
                }
            } else {
                // Released E - cancel fishing
                this.cancelFishing(player);
            }
        } else if (nearestSpot && interactHeld && !player.isControllingShip && !player.isInCrowsNest && !player.isRepairing) {
            // Start fishing
            this.startFishing(player, nearestSpot, time);
        }

        return null;
    }

    /**
     * Main update loop
     */
    update(player, ship, interactHeld, time) {
        if (!ship || this.fishingSpots.length === 0) return null;

        // Update spot positions
        this.updateSpotPositions(ship);

        // Update indicator
        this.updateIndicator(player);

        // Handle fishing
        return this.handleFishingInput(player, interactHeld, time);
    }
}
