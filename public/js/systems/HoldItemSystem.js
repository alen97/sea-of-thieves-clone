/**
 * HoldItemSystem - Manages player holding and using items
 */
class HoldItemSystem {
    constructor(scene) {
        this.scene = scene;
        this.heldItem = null;
        this.itemSprite = null;
    }

    /**
     * Initialize the system for a player
     * @param {Object} player - Player sprite
     */
    initialize(player) {
        player.heldItem = null;

        // Create indicator text for actions
        this.actionIndicator = this.scene.add.text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        });
        this.actionIndicator.setOrigin(0.5);
        this.actionIndicator.setDepth(15);
        this.actionIndicator.setVisible(false);
    }

    /**
     * Pick up an item
     * @param {Object} player - Player sprite
     * @param {Object} item - Item to pick up
     */
    pickUpItem(player, item) {
        if (player.heldItem) {
            console.log('Already holding an item!');
            return false;
        }

        player.heldItem = item;
        this.heldItem = item;

        // Create visual for held item
        this.createItemVisual(player, item);

        console.log(`Picked up: ${item.type}`);
        return true;
    }

    /**
     * Create visual representation of held item
     */
    createItemVisual(player, item) {
        // Destroy existing sprite
        if (this.itemSprite) {
            this.itemSprite.destroy();
        }

        // Create simple visual for the item
        const graphics = this.scene.add.graphics();
        graphics.fillStyle(item.color || 0xFFFFFF, 1);
        graphics.fillEllipse(0, 0, 10, 6);
        graphics.setDepth(12);

        this.itemSprite = graphics;
    }

    /**
     * Update held item position relative to player
     */
    updateItemPosition(player) {
        if (!this.itemSprite || !player.heldItem) return;

        // Position item in front of player
        const offsetDistance = 15;
        const angle = player.rotation - Math.PI / 2;
        const x = player.x + Math.cos(angle) * offsetDistance;
        const y = player.y + Math.sin(angle) * offsetDistance;

        this.itemSprite.setPosition(x, y);
    }

    /**
     * Drop/discard held item
     * @param {Object} player - Player sprite
     */
    dropItem(player) {
        if (!player.heldItem) return null;

        const item = player.heldItem;
        player.heldItem = null;
        this.heldItem = null;

        // Destroy visual
        if (this.itemSprite) {
            this.itemSprite.destroy();
            this.itemSprite = null;
        }

        console.log(`Dropped: ${item.type}`);
        return item;
    }

    /**
     * Use held item (eat fish for energy)
     * @param {Object} player - Player sprite
     * @param {Object} energySystem - Energy system reference
     * @returns {boolean} Whether item was used
     */
    useItem(player, energySystem) {
        if (!player.heldItem) return false;

        const item = player.heldItem;

        // If it's a fish, eat it for energy
        if (item.energy) {
            energySystem.restoreEnergy(player, item.energy);
            console.log(`Ate ${item.type}! +${item.energy} energy`);

            // Clear held item
            player.heldItem = null;
            this.heldItem = null;

            // Destroy visual
            if (this.itemSprite) {
                this.itemSprite.destroy();
                this.itemSprite = null;
            }

            return true;
        }

        return false;
    }

    /**
     * Store held item in crate
     * @param {Object} player - Player sprite
     * @param {Object} crateSystem - Crate system reference
     * @returns {boolean} Whether item was stored
     */
    storeInCrate(player, crateSystem) {
        if (!player.heldItem) return false;

        const crate = crateSystem.selectedCrate;
        if (!crate) return false;

        const item = player.heldItem;

        if (crateSystem.addItemToCrate(crate, item)) {
            console.log(`Stored ${item.type} in crate ${crate.index + 1}`);

            // Clear held item
            player.heldItem = null;
            this.heldItem = null;

            // Destroy visual
            if (this.itemSprite) {
                this.itemSprite.destroy();
                this.itemSprite = null;
            }

            return true;
        } else {
            console.log('Crate is full!');
            return false;
        }
    }

    /**
     * Check if player is holding an item
     */
    isHoldingItem(player) {
        return player.heldItem !== null;
    }

    /**
     * Update action indicator
     */
    updateIndicator(player, crateSystem) {
        if (!this.actionIndicator) return;

        if (!player.heldItem) {
            this.actionIndicator.setVisible(false);
            return;
        }

        let text = `${player.heldItem.type}\n`;
        text += 'Q: Comer  ';

        // Show store option if near crate
        if (crateSystem && crateSystem.selectedCrate) {
            text += 'E: Guardar';
        } else {
            text += 'R: Soltar';
        }

        this.actionIndicator.setText(text);
        this.actionIndicator.setPosition(player.x, player.y - 35);
        this.actionIndicator.setVisible(true);
    }

    /**
     * Handle input for held item actions
     * @param {Object} player - Player sprite
     * @param {Object} input - Input state
     * @param {Object} energySystem - Energy system
     * @param {Object} crateSystem - Crate system
     */
    handleInput(player, input, energySystem, crateSystem) {
        if (!player.heldItem) return;

        // Q - Use/eat item
        if (input.keyQ && Phaser.Input.Keyboard.JustDown(input.keyQ)) {
            this.useItem(player, energySystem);
        }

        // R - Drop item
        if (input.keyR && Phaser.Input.Keyboard.JustDown(input.keyR)) {
            this.dropItem(player);
        }

        // E - Store in crate (if near one)
        if (input.keyE && Phaser.Input.Keyboard.JustDown(input.keyE)) {
            if (crateSystem && crateSystem.selectedCrate) {
                this.storeInCrate(player, crateSystem);
            }
        }
    }

    /**
     * Main update loop
     */
    update(player, input, energySystem, crateSystem) {
        if (!player || !this.actionIndicator) return;

        // Update item position
        this.updateItemPosition(player);

        // Update indicator
        this.updateIndicator(player, crateSystem);

        // Handle input
        this.handleInput(player, input, energySystem, crateSystem);
    }
}
