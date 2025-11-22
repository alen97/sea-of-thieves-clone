/**
 * Chest System for Endless Sea of Rooms
 * Manages floating chests that can be hooked
 */

class ChestSystem {
    constructor(scene) {
        this.scene = scene;

        // Active chests
        this.chests = [];

        // Settings
        this.maxChests = 5;
        this.spawnCooldown = 15000; // ms
        this.lastSpawnTime = 0;

        // Floating animation
        this.floatSpeed = 0.002;
    }

    /**
     * Spawn a chest at position
     * @param {number} x
     * @param {number} y
     * @returns {Object} Chest object
     */
    spawnChest(x, y) {
        if (this.chests.length >= this.maxChests) return null;

        // Create chest sprite
        const sprite = this.scene.add.sprite(x, y, 'chest');
        sprite.setScale(0.6);

        // Floating animation
        this.scene.tweens.add({
            targets: sprite,
            y: y - 10,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Slight rotation
        this.scene.tweens.add({
            targets: sprite,
            angle: 5,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Generate contents
        const contents = this.generateContents();

        const chest = {
            id: Date.now() + Math.random(),
            x: x,
            y: y,
            sprite: sprite,
            contents: contents,
            isCollected: false,
            driftDirection: Math.random() * Math.PI * 2,
            driftSpeed: 5 + Math.random() * 10
        };

        this.chests.push(chest);

        return chest;
    }

    /**
     * Generate random chest contents
     * @returns {Object} Contents
     */
    generateContents() {
        // Multiple items from chest loot table
        const contents = {
            food: 0,
            water: 0,
            materials: 0
        };

        // Get 2-4 random items
        const numItems = 2 + Math.floor(Math.random() * 3);

        for (let i = 0; i < numItems; i++) {
            const item = getRandomLoot(CHEST_LOOT_TABLE);

            switch (item.category) {
                case 'food':
                    contents.food += item.value;
                    break;
                case 'water':
                    contents.water += item.value;
                    break;
                case 'material':
                    contents.materials += item.value;
                    break;
            }
        }

        return contents;
    }

    /**
     * Open a chest and add contents to storage
     * @param {Object} chest
     * @param {StorageBoxSystem} storage
     * @returns {Object} Contents added
     */
    openChest(chest, storage) {
        if (!chest || chest.isCollected) return null;

        chest.isCollected = true;

        // Add contents to storage
        if (chest.contents.food > 0) {
            storage.addItem({
                category: 'food',
                value: chest.contents.food
            });
        }
        if (chest.contents.water > 0) {
            storage.addItem({
                category: 'water',
                value: chest.contents.water
            });
        }
        if (chest.contents.materials > 0) {
            storage.addItem({
                category: 'material',
                value: chest.contents.materials
            });
        }

        // Play open sound
        if (this.scene.sound) {
            this.scene.sound.play('chest_open', { volume: 0.7 });
        }

        // Destroy sprite
        if (chest.sprite) {
            // Open animation
            this.scene.tweens.add({
                targets: chest.sprite,
                scale: 0.8,
                alpha: 0,
                duration: 500,
                onComplete: () => {
                    chest.sprite.destroy();
                    chest.sprite = null;
                }
            });
        }

        // Emit event
        this.scene.events.emit('chestOpened', chest.contents);

        return chest.contents;
    }

    /**
     * Update all chests
     * @param {number} time
     * @param {number} deltaTime
     */
    update(time, deltaTime) {
        for (const chest of this.chests) {
            if (chest.isCollected) continue;

            // Slow drift
            chest.x += Math.cos(chest.driftDirection) * chest.driftSpeed * deltaTime;
            chest.y += Math.sin(chest.driftDirection) * chest.driftSpeed * deltaTime;

            // Update sprite position (tween handles the float effect)
            if (chest.sprite) {
                chest.sprite.x = chest.x;
            }
        }

        // Clean up collected chests
        this.chests = this.chests.filter(chest => !chest.isCollected || chest.sprite);

        // Remove chests that drifted out of room
        this.chests = this.chests.filter(chest => {
            if (chest.x < -100 || chest.x > 3300 ||
                chest.y < -100 || chest.y > 3300) {
                if (chest.sprite) {
                    chest.sprite.destroy();
                }
                return false;
            }
            return true;
        });
    }

    /**
     * Try to spawn chest based on biome chance
     * @param {number} time
     * @param {number} chestChance
     */
    trySpawnChest(time, chestChance) {
        if (time - this.lastSpawnTime < this.spawnCooldown) return;

        if (Math.random() < chestChance) {
            // Spawn at random position
            const x = 200 + Math.random() * 2800;
            const y = 200 + Math.random() * 2800;

            this.spawnChest(x, y);
            this.lastSpawnTime = time;
        }
    }

    /**
     * Get all active chests
     * @returns {Array}
     */
    getActiveChests() {
        return this.chests.filter(chest => !chest.isCollected);
    }

    /**
     * Find nearest chest to position
     * @param {number} x
     * @param {number} y
     * @returns {Object|null}
     */
    getNearestChest(x, y) {
        let nearest = null;
        let minDistance = Infinity;

        for (const chest of this.chests) {
            if (chest.isCollected) continue;

            const dx = x - chest.x;
            const dy = y - chest.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;
                nearest = chest;
            }
        }

        return nearest;
    }

    /**
     * Clear all chests
     */
    clearAll() {
        for (const chest of this.chests) {
            if (chest.sprite) {
                chest.sprite.destroy();
            }
        }
        this.chests = [];
    }

    /**
     * Clean up
     */
    destroy() {
        this.clearAll();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChestSystem };
}
