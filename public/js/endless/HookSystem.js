/**
 * Hook System for Endless Sea of Rooms
 * Front hook for capturing floating chests
 */

class HookSystem {
    constructor(scene) {
        this.scene = scene;

        // Sprites
        this.hookSprite = null;
        this.ropeSprite = null;
        this.boat = null;

        // State
        this.isDeployed = false;
        this.isRetracting = false;
        this.targetChest = null;
        this.caughtItem = null;

        // Settings
        this.hookRange = 200;
        this.hookSpeed = 300;
        this.retractSpeed = 200;

        // Positions
        this.hookPosition = { x: 0, y: 0 };
        this.deployDirection = 0;
    }

    /**
     * Initialize hook with boat reference
     * @param {Object} boat - Boat object
     */
    init(boat) {
        this.boat = boat;

        // Create hook sprite (at boat position initially)
        this.hookSprite = this.scene.add.sprite(0, 0, 'hook');
        this.hookSprite.setScale(0.5);
        this.hookSprite.setVisible(false);

        // Create rope graphics
        this.ropeGraphics = this.scene.add.graphics();

        this.updatePosition();
    }

    /**
     * Update hook position to follow boat when not deployed
     */
    updatePosition() {
        if (!this.boat) return;

        const hookOffset = this.boat.hookOffset;
        const cos = Math.cos(this.boat.state.rotation);
        const sin = Math.sin(this.boat.state.rotation);

        this.basePosition = {
            x: this.boat.state.x + hookOffset.x * cos - hookOffset.y * sin,
            y: this.boat.state.y + hookOffset.x * sin + hookOffset.y * cos
        };

        if (!this.isDeployed) {
            this.hookPosition = { ...this.basePosition };
        }
    }

    /**
     * Deploy hook forward
     */
    deploy() {
        if (this.isDeployed || this.isRetracting) return false;

        this.isDeployed = true;
        this.deployDirection = this.boat.state.rotation - Math.PI / 2;

        this.hookSprite.setVisible(true);
        this.hookSprite.x = this.basePosition.x;
        this.hookSprite.y = this.basePosition.y;
        this.hookSprite.rotation = this.deployDirection + Math.PI / 2;

        // Calculate target position
        const targetX = this.basePosition.x + Math.cos(this.deployDirection) * this.hookRange;
        const targetY = this.basePosition.y + Math.sin(this.deployDirection) * this.hookRange;

        // Animate hook deployment
        const duration = (this.hookRange / this.hookSpeed) * 1000;

        this.scene.tweens.add({
            targets: this.hookSprite,
            x: targetX,
            y: targetY,
            duration: duration,
            ease: 'Linear',
            onUpdate: () => {
                this.hookPosition = { x: this.hookSprite.x, y: this.hookSprite.y };
                this.drawRope();
            },
            onComplete: () => {
                // Auto-retract if nothing caught
                if (!this.targetChest) {
                    this.retract();
                }
            }
        });

        // Play deploy sound
        if (this.scene.sound) {
            this.scene.sound.play('hook_deploy', { volume: 0.5 });
        }

        return true;
    }

    /**
     * Retract hook back to boat
     */
    retract() {
        if (!this.isDeployed || this.isRetracting) return;

        this.isRetracting = true;

        // Stop any current tween
        this.scene.tweens.killTweensOf(this.hookSprite);

        // Calculate distance
        const dx = this.hookSprite.x - this.basePosition.x;
        const dy = this.hookSprite.y - this.basePosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const duration = (distance / this.retractSpeed) * 1000;

        this.scene.tweens.add({
            targets: this.hookSprite,
            x: this.basePosition.x,
            y: this.basePosition.y,
            duration: duration,
            ease: 'Quad.in',
            onUpdate: () => {
                this.hookPosition = { x: this.hookSprite.x, y: this.hookSprite.y };
                this.drawRope();

                // Move caught chest with hook
                if (this.targetChest && this.targetChest.sprite) {
                    this.targetChest.sprite.x = this.hookSprite.x;
                    this.targetChest.sprite.y = this.hookSprite.y;
                }
            },
            onComplete: () => {
                this.finishRetract();
            }
        });

        // Play retract sound
        if (this.scene.sound) {
            this.scene.sound.play('hook_retract', { volume: 0.4 });
        }
    }

    /**
     * Finish retract process
     */
    finishRetract() {
        this.isDeployed = false;
        this.isRetracting = false;
        this.hookSprite.setVisible(false);
        this.ropeGraphics.clear();

        // If we caught something, emit event
        if (this.targetChest) {
            this.caughtItem = this.targetChest;
            this.scene.events.emit('chestCaught', this.targetChest);
            this.targetChest = null;

            // Play catch sound
            if (this.scene.sound) {
                this.scene.sound.play('chest_catch', { volume: 0.6 });
            }
        }
    }

    /**
     * Draw rope between boat and hook
     */
    drawRope() {
        this.ropeGraphics.clear();

        if (!this.isDeployed) return;

        this.ropeGraphics.lineStyle(2, 0x8B4513);
        this.ropeGraphics.beginPath();
        this.ropeGraphics.moveTo(this.basePosition.x, this.basePosition.y);
        this.ropeGraphics.lineTo(this.hookSprite.x, this.hookSprite.y);
        this.ropeGraphics.strokePath();
    }

    /**
     * Check collision with chests
     * @param {Array} chests - Array of chest objects
     */
    checkChestCollision(chests) {
        if (!this.isDeployed || this.isRetracting || this.targetChest) return;

        const hookRadius = 20;

        for (const chest of chests) {
            if (!chest.sprite || chest.isCollected) continue;

            const dx = this.hookSprite.x - chest.sprite.x;
            const dy = this.hookSprite.y - chest.sprite.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < hookRadius + 30) {
                this.catchChest(chest);
                break;
            }
        }
    }

    /**
     * Catch a chest
     * @param {Object} chest - Chest object
     */
    catchChest(chest) {
        this.targetChest = chest;

        // Stop hook movement
        this.scene.tweens.killTweensOf(this.hookSprite);

        // Start retracting with chest
        this.retract();
    }

    /**
     * Collect caught item
     * @param {PlayerInventorySystem} inventory - Player inventory
     * @returns {boolean} True if collected
     */
    collectCaughtItem(inventory) {
        if (!this.caughtItem) return false;

        // Chests contain multiple items, handle differently
        this.scene.events.emit('openChest', this.caughtItem);
        this.caughtItem = null;

        return true;
    }

    /**
     * Check if hook has caught something
     * @returns {boolean}
     */
    hasCaughtItem() {
        return this.caughtItem !== null;
    }

    /**
     * Main update loop
     * @param {number} time
     * @param {number} deltaTime
     */
    update(time, deltaTime) {
        this.updatePosition();

        if (this.isDeployed) {
            this.drawRope();
        }
    }

    /**
     * Check if hook can be deployed
     * @returns {boolean}
     */
    canDeploy() {
        return !this.isDeployed && !this.isRetracting;
    }

    /**
     * Clean up
     */
    destroy() {
        if (this.hookSprite) this.hookSprite.destroy();
        if (this.ropeGraphics) this.ropeGraphics.destroy();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HookSystem };
}
