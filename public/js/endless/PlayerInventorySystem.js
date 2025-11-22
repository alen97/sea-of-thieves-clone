/**
 * Player Inventory System for Endless Sea of Rooms
 * Handles item pickup, carrying, and dropping
 * Player can only hold one item at a time
 */

class PlayerInventorySystem {
    constructor(scene) {
        this.scene = scene;
        this.heldItem = null;
        this.heldItemSprite = null;
        this.playerSprite = null;
    }

    /**
     * Initialize with player reference
     * @param {Phaser.GameObjects.Sprite} playerSprite - The player sprite
     */
    init(playerSprite) {
        this.playerSprite = playerSprite;
    }

    /**
     * Check if player is holding an item
     * @returns {boolean}
     */
    isHoldingItem() {
        return this.heldItem !== null;
    }

    /**
     * Pick up an item
     * @param {Object} item - Item object from ItemTypes
     * @returns {boolean} True if pickup successful
     */
    pickupItem(item) {
        if (this.heldItem) {
            // Already holding something
            return false;
        }

        this.heldItem = item;
        this.createHeldItemSprite();

        // Play pickup sound
        if (this.scene.sound) {
            this.scene.sound.play('pickup', { volume: 0.5 });
        }

        return true;
    }

    /**
     * Drop the currently held item
     * @returns {Object|null} The dropped item, or null if not holding anything
     */
    dropItem() {
        if (!this.heldItem) return null;

        const droppedItem = this.heldItem;
        this.heldItem = null;

        if (this.heldItemSprite) {
            this.heldItemSprite.destroy();
            this.heldItemSprite = null;
        }

        return droppedItem;
    }

    /**
     * Get the currently held item without dropping it
     * @returns {Object|null} The held item
     */
    getHeldItem() {
        return this.heldItem;
    }

    /**
     * Deposit held item into storage
     * @param {StorageBoxSystem} storage - The storage system
     * @returns {boolean} True if deposit successful
     */
    depositToStorage(storage) {
        if (!this.heldItem) return false;

        const success = storage.addItem(this.heldItem);
        if (success) {
            this.heldItem = null;
            if (this.heldItemSprite) {
                this.heldItemSprite.destroy();
                this.heldItemSprite = null;
            }

            // Play deposit sound
            if (this.scene.sound) {
                this.scene.sound.play('deposit', { volume: 0.5 });
            }
        }

        return success;
    }

    /**
     * Create sprite for held item (shows above player)
     */
    createHeldItemSprite() {
        if (this.heldItemSprite) {
            this.heldItemSprite.destroy();
        }

        if (!this.heldItem || !this.playerSprite) return;

        // Create item sprite above player
        this.heldItemSprite = this.scene.add.sprite(
            this.playerSprite.x,
            this.playerSprite.y - 30,
            this.heldItem.sprite || 'default_item'
        );
        this.heldItemSprite.setScale(0.5);
        this.heldItemSprite.setDepth(this.playerSprite.depth + 1);
    }

    /**
     * Update held item sprite position
     */
    update() {
        if (this.heldItemSprite && this.playerSprite) {
            this.heldItemSprite.x = this.playerSprite.x;
            this.heldItemSprite.y = this.playerSprite.y - 30;
        }
    }

    /**
     * Clean up
     */
    destroy() {
        if (this.heldItemSprite) {
            this.heldItemSprite.destroy();
            this.heldItemSprite = null;
        }
        this.heldItem = null;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PlayerInventorySystem };
}
