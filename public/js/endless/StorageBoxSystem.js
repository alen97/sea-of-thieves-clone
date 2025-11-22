/**
 * Storage Box System for Endless Sea of Rooms
 * Simple inventory with quantities for food, water, and materials
 */

class StorageBoxSystem {
    constructor(scene) {
        this.scene = scene;

        // Storage quantities
        this.storage = {
            food: 0,
            water: 0,
            materials: 0
        };

        // Maximum capacity
        this.maxCapacity = {
            food: 30,
            water: 30,
            materials: 100
        };

        // Visual elements
        this.storageSprite = null;
        this.interactionZone = null;
    }

    /**
     * Create storage box sprite on the boat
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    createSprite(x, y) {
        this.storageSprite = this.scene.add.sprite(x, y, 'storage_box');
        this.storageSprite.setScale(0.8);

        // Create interaction zone
        this.interactionZone = this.scene.add.zone(x, y, 40, 40);
        this.scene.physics.add.existing(this.interactionZone, true);
    }

    /**
     * Add item to storage
     * @param {Object} item - Item from ItemTypes
     * @returns {boolean} True if added successfully
     */
    addItem(item) {
        const category = item.category;
        const value = item.value || 1;

        if (!this.storage.hasOwnProperty(category)) {
            console.warn(`Unknown category: ${category}`);
            return false;
        }

        const newAmount = this.storage[category] + value;
        if (newAmount > this.maxCapacity[category]) {
            // Storage full
            return false;
        }

        this.storage[category] = newAmount;
        this.onStorageChanged();
        return true;
    }

    /**
     * Remove/consume from storage
     * @param {string} category - 'food', 'water', or 'materials'
     * @param {number} amount - Amount to consume
     * @returns {boolean} True if consumed successfully
     */
    consume(category, amount) {
        if (!this.storage.hasOwnProperty(category)) {
            return false;
        }

        if (this.storage[category] >= amount) {
            this.storage[category] -= amount;
            this.onStorageChanged();
            return true;
        }

        return false;
    }

    /**
     * Get current amount in category
     * @param {string} category
     * @returns {number}
     */
    getAmount(category) {
        return this.storage[category] || 0;
    }

    /**
     * Get max capacity for category
     * @param {string} category
     * @returns {number}
     */
    getMaxCapacity(category) {
        return this.maxCapacity[category] || 0;
    }

    /**
     * Check if storage has space for item
     * @param {Object} item
     * @returns {boolean}
     */
    hasSpace(item) {
        const category = item.category;
        const value = item.value || 1;
        return this.storage[category] + value <= this.maxCapacity[category];
    }

    /**
     * Get all storage data
     * @returns {Object}
     */
    getStorageData() {
        return {
            food: {
                current: this.storage.food,
                max: this.maxCapacity.food
            },
            water: {
                current: this.storage.water,
                max: this.maxCapacity.water
            },
            materials: {
                current: this.storage.materials,
                max: this.maxCapacity.materials
            }
        };
    }

    /**
     * Set initial storage (for loading saves)
     * @param {Object} data
     */
    setStorageData(data) {
        if (data.food !== undefined) this.storage.food = data.food;
        if (data.water !== undefined) this.storage.water = data.water;
        if (data.materials !== undefined) this.storage.materials = data.materials;
        this.onStorageChanged();
    }

    /**
     * Called when storage changes - emit event for UI update
     */
    onStorageChanged() {
        this.scene.events.emit('storageChanged', this.getStorageData());
    }

    /**
     * Check if player is near storage box
     * @param {Phaser.GameObjects.Sprite} playerSprite
     * @param {number} range - Interaction range
     * @returns {boolean}
     */
    isPlayerNear(playerSprite, range = 50) {
        if (!this.storageSprite || !playerSprite) return false;

        const dx = playerSprite.x - this.storageSprite.x;
        const dy = playerSprite.y - this.storageSprite.y;
        return Math.sqrt(dx * dx + dy * dy) <= range;
    }

    /**
     * Update storage position (follows boat)
     * @param {number} x
     * @param {number} y
     */
    updatePosition(x, y) {
        if (this.storageSprite) {
            this.storageSprite.x = x;
            this.storageSprite.y = y;
        }
        if (this.interactionZone) {
            this.interactionZone.x = x;
            this.interactionZone.y = y;
        }
    }

    /**
     * Clean up
     */
    destroy() {
        if (this.storageSprite) {
            this.storageSprite.destroy();
        }
        if (this.interactionZone) {
            this.interactionZone.destroy();
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageBoxSystem };
}
