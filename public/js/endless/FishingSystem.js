/**
 * Fishing System for Endless Sea of Rooms
 * Automatic lateral fishing from boat sides
 */

class FishingSystem {
    constructor(scene) {
        this.scene = scene;

        // Rod sprites
        this.leftRod = null;
        this.rightRod = null;

        // Fishing timers
        this.fishingInterval = 4000; // ms between catches
        this.lastFishTime = 0;

        // Current catch
        this.pendingCatch = null;
        this.catchSprite = null;

        // Settings
        this.minSpeedToFish = 20; // Boat needs to be moving
        this.catchAnimationDuration = 1000;

        // State
        this.isActive = false;
        this.isCatching = false;
    }

    /**
     * Create fishing rod sprites
     * @param {Object} boat - Boat object from SmallBoatFunctions
     */
    createRods(boat) {
        this.boat = boat;

        // Left rod
        this.leftRod = this.scene.add.sprite(0, 0, 'fishing_rod');
        this.leftRod.setOrigin(0.5, 1);
        this.leftRod.setScale(0.6);
        this.leftRod.setFlipX(true);

        // Right rod
        this.rightRod = this.scene.add.sprite(0, 0, 'fishing_rod');
        this.rightRod.setOrigin(0.5, 1);
        this.rightRod.setScale(0.6);

        this.updateRodPositions();
    }

    /**
     * Update rod positions based on boat
     */
    updateRodPositions() {
        if (!this.boat || !this.leftRod || !this.rightRod) return;

        const cos = Math.cos(this.boat.state.rotation);
        const sin = Math.sin(this.boat.state.rotation);

        // Left rod position
        const leftOffset = this.boat.rodLeftOffset;
        this.leftRod.x = this.boat.state.x + leftOffset.x * cos - leftOffset.y * sin;
        this.leftRod.y = this.boat.state.y + leftOffset.x * sin + leftOffset.y * cos;
        this.leftRod.rotation = this.boat.state.rotation - 0.3;

        // Right rod position
        const rightOffset = this.boat.rodRightOffset;
        this.rightRod.x = this.boat.state.x + rightOffset.x * cos - rightOffset.y * sin;
        this.rightRod.y = this.boat.state.y + rightOffset.x * sin + rightOffset.y * cos;
        this.rightRod.rotation = this.boat.state.rotation + 0.3;
    }

    /**
     * Main update loop
     * @param {number} time - Current time
     * @param {number} deltaTime - Time since last update
     */
    update(time, deltaTime) {
        this.updateRodPositions();

        if (!this.boat || this.isCatching) return;

        // Check if boat is moving fast enough to fish
        const speed = this.boat.state.currentSpeed;
        this.isActive = speed >= this.minSpeedToFish && !this.boat.state.isAnchored;

        // Animate rods based on activity
        if (this.isActive) {
            const rodBob = Math.sin(time * 0.003) * 0.05;
            this.leftRod.rotation = this.boat.state.rotation - 0.3 + rodBob;
            this.rightRod.rotation = this.boat.state.rotation + 0.3 - rodBob;
        }

        // Check for catch
        if (this.isActive && time - this.lastFishTime >= this.fishingInterval) {
            this.attemptCatch(time);
        }

        // Update catch sprite position
        if (this.catchSprite) {
            this.catchSprite.x = this.boat.state.x;
            this.catchSprite.y = this.boat.state.y - 50;
        }
    }

    /**
     * Attempt to catch something
     * @param {number} time - Current time
     */
    attemptCatch(time) {
        this.lastFishTime = time;

        // Random chance to catch
        if (Math.random() > 0.7) return; // 70% chance to catch

        // Get random loot
        const loot = getRandomLoot(FISHING_LOOT_TABLE);
        this.pendingCatch = loot;
        this.isCatching = true;

        // Animate catch
        this.playCatchAnimation(loot);
    }

    /**
     * Play catch animation
     * @param {Object} item - Caught item
     */
    playCatchAnimation(item) {
        // Create catch sprite
        const side = Math.random() > 0.5 ? 'left' : 'right';
        const rod = side === 'left' ? this.leftRod : this.rightRod;

        this.catchSprite = this.scene.add.sprite(
            rod.x,
            rod.y + 20,
            item.sprite || 'fish_common'
        );
        this.catchSprite.setScale(0.4);
        this.catchSprite.setAlpha(0);

        // Animate rod pulling
        this.scene.tweens.add({
            targets: rod,
            rotation: rod.rotation + (side === 'left' ? 0.5 : -0.5),
            duration: 300,
            yoyo: true
        });

        // Animate catch appearing
        this.scene.tweens.add({
            targets: this.catchSprite,
            alpha: 1,
            y: this.boat.state.y - 50,
            duration: 500,
            ease: 'Back.out',
            onComplete: () => {
                // Play catch sound
                if (this.scene.sound) {
                    this.scene.sound.play('catch', { volume: 0.6 });
                }

                // Emit event
                this.scene.events.emit('fishCaught', item);

                // Wait for player to collect
                this.scene.time.delayedCall(this.catchAnimationDuration, () => {
                    this.finishCatch();
                });
            }
        });
    }

    /**
     * Finish catch process
     */
    finishCatch() {
        this.isCatching = false;

        if (this.catchSprite) {
            this.catchSprite.destroy();
            this.catchSprite = null;
        }
    }

    /**
     * Collect the pending catch
     * @param {PlayerInventorySystem} inventory - Player inventory
     * @returns {boolean} True if collected
     */
    collectCatch(inventory) {
        if (!this.pendingCatch) return false;

        const success = inventory.pickupItem(this.pendingCatch);
        if (success) {
            this.pendingCatch = null;
            this.finishCatch();
        }

        return success;
    }

    /**
     * Check if there's a catch waiting
     * @returns {boolean}
     */
    hasPendingCatch() {
        return this.pendingCatch !== null;
    }

    /**
     * Get pending catch info
     * @returns {Object|null}
     */
    getPendingCatch() {
        return this.pendingCatch;
    }

    /**
     * Set fishing parameters
     * @param {Object} params
     */
    setParameters(params) {
        if (params.interval) this.fishingInterval = params.interval;
        if (params.minSpeed) this.minSpeedToFish = params.minSpeed;
    }

    /**
     * Clean up
     */
    destroy() {
        if (this.leftRod) this.leftRod.destroy();
        if (this.rightRod) this.rightRod.destroy();
        if (this.catchSprite) this.catchSprite.destroy();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FishingSystem };
}
