/**
 * Cooking System for Endless Sea of Rooms
 * Cook fish and purify water
 */

class CookingSystem {
    constructor(scene) {
        this.scene = scene;

        // Cooking station sprite
        this.stationSprite = null;
        this.fireSprite = null;

        // Timers
        this.cookingTime = 3000; // ms to cook
        this.purifyTime = 2000; // ms to purify

        // State
        this.isCooking = false;
        this.isPurifying = false;
        this.currentItem = null;
        this.progressBar = null;
        this.progressBarBg = null;

        // Cooking timer
        this.cookingTimer = null;
        this.cookingStartTime = 0;
    }

    /**
     * Create cooking station on boat
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    createStation(x, y) {
        // Background/stove
        this.stationSprite = this.scene.add.sprite(x, y, 'cooking_station');
        this.stationSprite.setScale(0.6);

        // Fire animation (hidden when not cooking)
        this.fireSprite = this.scene.add.sprite(x, y - 10, 'fire');
        this.fireSprite.setScale(0.4);
        this.fireSprite.setVisible(false);

        // Progress bar background
        this.progressBarBg = this.scene.add.rectangle(x, y - 25, 40, 6, 0x333333);
        this.progressBarBg.setVisible(false);

        // Progress bar
        this.progressBar = this.scene.add.rectangle(x - 20, y - 25, 0, 4, 0x00ff00);
        this.progressBar.setOrigin(0, 0.5);
        this.progressBar.setVisible(false);
    }

    /**
     * Start cooking a fish
     * @param {Object} item - Raw fish item
     * @param {StorageBoxSystem} storage - Storage to get item from and add cooked item
     * @returns {boolean} True if cooking started
     */
    startCooking(item, storage) {
        if (this.isCooking || this.isPurifying) return false;
        if (!item || !item.needsCooking) return false;

        this.isCooking = true;
        this.currentItem = item;
        this.cookingStartTime = this.scene.time.now;

        // Show visuals
        this.fireSprite.setVisible(true);
        this.progressBarBg.setVisible(true);
        this.progressBar.setVisible(true);

        // Play cooking sound
        if (this.scene.sound) {
            this.scene.sound.play('cooking', { volume: 0.4, loop: true });
        }

        // Start timer
        this.cookingTimer = this.scene.time.delayedCall(this.cookingTime, () => {
            this.finishCooking(storage);
        });

        this.scene.events.emit('cookingStarted', item);

        return true;
    }

    /**
     * Finish cooking process
     * @param {StorageBoxSystem} storage
     */
    finishCooking(storage) {
        if (!this.isCooking) return;

        // Create cooked item
        const cookedItem = {
            ...ITEM_TYPES.FISH_COOKED,
            nutrition: this.currentItem.nutrition * 1.5 // Cooked fish more nutritious
        };

        // Add to storage
        storage.addItem(cookedItem);

        // Stop sounds
        if (this.scene.sound) {
            this.scene.sound.stopByKey('cooking');
            this.scene.sound.play('cooking_done', { volume: 0.5 });
        }

        // Reset state
        this.isCooking = false;
        this.currentItem = null;

        // Hide visuals
        this.fireSprite.setVisible(false);
        this.progressBarBg.setVisible(false);
        this.progressBar.setVisible(false);
        this.progressBar.width = 0;

        this.scene.events.emit('cookingFinished', cookedItem);
    }

    /**
     * Start purifying water
     * @param {Object} item - Dirty water item
     * @param {StorageBoxSystem} storage
     * @returns {boolean}
     */
    startPurifying(item, storage) {
        if (this.isCooking || this.isPurifying) return false;
        if (!item || !item.needsPurify) return false;

        this.isPurifying = true;
        this.currentItem = item;
        this.cookingStartTime = this.scene.time.now;

        // Show visuals
        this.fireSprite.setVisible(true);
        this.progressBarBg.setVisible(true);
        this.progressBar.setVisible(true);

        // Play purifying sound
        if (this.scene.sound) {
            this.scene.sound.play('purifying', { volume: 0.4, loop: true });
        }

        // Start timer
        this.cookingTimer = this.scene.time.delayedCall(this.purifyTime, () => {
            this.finishPurifying(storage);
        });

        this.scene.events.emit('purifyingStarted', item);

        return true;
    }

    /**
     * Finish purifying water
     * @param {StorageBoxSystem} storage
     */
    finishPurifying(storage) {
        if (!this.isPurifying) return;

        // Create clean water
        const cleanWater = {
            ...ITEM_TYPES.WATER_CLEAN
        };

        // Add to storage
        storage.addItem(cleanWater);

        // Stop sounds
        if (this.scene.sound) {
            this.scene.sound.stopByKey('purifying');
            this.scene.sound.play('purify_done', { volume: 0.5 });
        }

        // Reset state
        this.isPurifying = false;
        this.currentItem = null;

        // Hide visuals
        this.fireSprite.setVisible(false);
        this.progressBarBg.setVisible(false);
        this.progressBar.setVisible(false);
        this.progressBar.width = 0;

        this.scene.events.emit('purifyingFinished', cleanWater);
    }

    /**
     * Cancel current cooking/purifying
     */
    cancel() {
        if (this.cookingTimer) {
            this.cookingTimer.remove();
            this.cookingTimer = null;
        }

        // Stop sounds
        if (this.scene.sound) {
            this.scene.sound.stopByKey('cooking');
            this.scene.sound.stopByKey('purifying');
        }

        this.isCooking = false;
        this.isPurifying = false;
        this.currentItem = null;

        // Hide visuals
        this.fireSprite.setVisible(false);
        this.progressBarBg.setVisible(false);
        this.progressBar.setVisible(false);
    }

    /**
     * Update cooking progress
     */
    update() {
        if (!this.isCooking && !this.isPurifying) return;

        const elapsed = this.scene.time.now - this.cookingStartTime;
        const duration = this.isCooking ? this.cookingTime : this.purifyTime;
        const progress = Math.min(elapsed / duration, 1);

        // Update progress bar
        this.progressBar.width = 40 * progress;
    }

    /**
     * Update station position (follows boat)
     * @param {number} x
     * @param {number} y
     * @param {number} rotation
     */
    updatePosition(x, y, rotation) {
        if (this.stationSprite) {
            this.stationSprite.x = x;
            this.stationSprite.y = y;
            this.stationSprite.rotation = rotation;
        }
        if (this.fireSprite) {
            this.fireSprite.x = x;
            this.fireSprite.y = y - 10;
        }
        if (this.progressBarBg) {
            this.progressBarBg.x = x;
            this.progressBarBg.y = y - 25;
        }
        if (this.progressBar) {
            this.progressBar.x = x - 20;
            this.progressBar.y = y - 25;
        }
    }

    /**
     * Check if player is near cooking station
     * @param {Phaser.GameObjects.Sprite} playerSprite
     * @param {number} range
     * @returns {boolean}
     */
    isPlayerNear(playerSprite, range = 50) {
        if (!this.stationSprite || !playerSprite) return false;

        const dx = playerSprite.x - this.stationSprite.x;
        const dy = playerSprite.y - this.stationSprite.y;
        return Math.sqrt(dx * dx + dy * dy) <= range;
    }

    /**
     * Check if busy
     * @returns {boolean}
     */
    isBusy() {
        return this.isCooking || this.isPurifying;
    }

    /**
     * Clean up
     */
    destroy() {
        this.cancel();
        if (this.stationSprite) this.stationSprite.destroy();
        if (this.fireSprite) this.fireSprite.destroy();
        if (this.progressBarBg) this.progressBarBg.destroy();
        if (this.progressBar) this.progressBar.destroy();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CookingSystem };
}
