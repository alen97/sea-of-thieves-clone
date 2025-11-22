/**
 * CrateSystem - Manages storage crates on the ship for inventory
 */
class CrateSystem {
    constructor(scene) {
        this.scene = scene;
        this.crates = [];
        this.maxSlots = 5; // Items per crate
        this.interactionRadius = 50;
        this.selectedCrate = null;
    }

    /**
     * Create crates on the ship
     * @param {Object} ship - Ship sprite
     */
    createCrates(ship) {
        // Define crate positions relative to ship center
        const cratePositions = [
            { x: -40, y: 100 },  // Back left
            { x: 40, y: 100 }    // Back right
        ];

        cratePositions.forEach((pos, index) => {
            const crate = this.createCrate(ship, pos.x, pos.y, index);
            this.crates.push(crate);
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

        return this.crates;
    }

    /**
     * Create a single crate
     */
    createCrate(ship, offsetX, offsetY, index) {
        // Create crate visual (simple rectangle)
        const graphics = this.scene.add.graphics();
        graphics.fillStyle(0x8B4513, 1); // Brown color
        graphics.fillRect(-12, -12, 24, 24);
        graphics.lineStyle(2, 0x5D3A1A);
        graphics.strokeRect(-12, -12, 24, 24);

        // Add cross pattern
        graphics.lineStyle(1, 0x3D2A0A);
        graphics.lineBetween(-12, 0, 12, 0);
        graphics.lineBetween(0, -12, 0, 12);

        graphics.setDepth(2.6);

        // Store crate data
        const crate = {
            graphics: graphics,
            offsetX: offsetX,
            offsetY: offsetY,
            index: index,
            items: [], // Array of items stored
            maxSlots: this.maxSlots
        };

        return crate;
    }

    /**
     * Update crate positions relative to ship
     */
    updateCratePositions(ship) {
        this.crates.forEach(crate => {
            // Calculate world position based on ship rotation
            const cos = Math.cos(ship.rotation);
            const sin = Math.sin(ship.rotation);
            const worldX = ship.x + (crate.offsetX * cos - crate.offsetY * sin);
            const worldY = ship.y + (crate.offsetX * sin + crate.offsetY * cos);

            crate.graphics.setPosition(worldX, worldY);
            crate.graphics.setRotation(ship.rotation);
        });
    }

    /**
     * Get nearest crate to player
     */
    getNearestCrate(player) {
        let nearestCrate = null;
        let nearestDistance = this.interactionRadius;

        this.crates.forEach(crate => {
            const dx = player.x - crate.graphics.x;
            const dy = player.y - crate.graphics.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestCrate = crate;
            }
        });

        return nearestCrate;
    }

    /**
     * Check if player is near any crate
     */
    isNearCrate(player) {
        return this.getNearestCrate(player) !== null;
    }

    /**
     * Add item to crate
     * @param {Object} crate - Target crate
     * @param {Object} item - Item to add
     * @returns {boolean} Success
     */
    addItemToCrate(crate, item) {
        if (crate.items.length < crate.maxSlots) {
            crate.items.push(item);
            return true;
        }
        return false;
    }

    /**
     * Remove item from crate
     * @param {Object} crate - Target crate
     * @param {number} index - Item index
     * @returns {Object|null} Removed item
     */
    removeItemFromCrate(crate, index) {
        if (index >= 0 && index < crate.items.length) {
            return crate.items.splice(index, 1)[0];
        }
        return null;
    }

    /**
     * Get crate contents
     */
    getCrateContents(crate) {
        return crate.items;
    }

    /**
     * Update indicator based on player position
     */
    updateIndicator(player) {
        const nearestCrate = this.getNearestCrate(player);

        if (nearestCrate && !player.isControllingShip && !player.isInCrowsNest && !player.isRepairing) {
            const itemCount = nearestCrate.items.length;
            const text = `Caja ${nearestCrate.index + 1} [${itemCount}/${nearestCrate.maxSlots}]\nPresiona E para interactuar`;

            this.indicator.setText(text);
            this.indicator.setPosition(nearestCrate.graphics.x, nearestCrate.graphics.y - 30);
            this.indicator.setVisible(true);
            this.selectedCrate = nearestCrate;
        } else {
            this.indicator.setVisible(false);
            this.selectedCrate = null;
        }
    }

    /**
     * Handle interaction with crate
     * @param {Object} player - Player sprite
     * @param {boolean} interactPressed - E key pressed
     * @returns {Object|null} Selected crate for interaction
     */
    handleInteraction(player, interactPressed) {
        if (!interactPressed || !this.selectedCrate) return null;

        // Return the selected crate for external handling
        return this.selectedCrate;
    }

    /**
     * Main update loop
     */
    update(player, ship, interactPressed) {
        if (!ship || this.crates.length === 0) return;

        // Update crate positions
        this.updateCratePositions(ship);

        // Update indicator
        this.updateIndicator(player);

        // Handle interaction
        return this.handleInteraction(player, interactPressed);
    }

    /**
     * Get all crates data for syncing
     */
    getCratesData() {
        return this.crates.map(crate => ({
            index: crate.index,
            items: crate.items
        }));
    }

    /**
     * Set crates data from server
     */
    setCratesData(data) {
        data.forEach(crateData => {
            const crate = this.crates.find(c => c.index === crateData.index);
            if (crate) {
                crate.items = crateData.items || [];
            }
        });
    }
}
