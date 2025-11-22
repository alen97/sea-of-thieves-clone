/**
 * Survival System for Endless Sea of Rooms
 * Manages hunger, thirst, and player health
 */

class SurvivalSystem {
    constructor(scene) {
        this.scene = scene;

        // Stats (0-100)
        this.hunger = 100;
        this.thirst = 100;
        this.health = 100;

        // Decay rates (per second)
        this.hungerDecayRate = 0.5;
        this.thirstDecayRate = 0.7; // Thirst depletes faster

        // Damage settings
        this.damageThreshold = 20; // Start taking damage below this
        this.starvationDamage = 2; // Damage per second when starving
        this.dehydrationDamage = 3; // Damage per second when dehydrated

        // Regeneration
        this.healthRegenRate = 1; // Health per second when well-fed
        this.healthRegenThreshold = 50; // Need hunger/thirst above this to regen

        // Warning thresholds
        this.warningThreshold = 30;
        this.criticalThreshold = 15;

        // State tracking
        this.isStarving = false;
        this.isDehydrated = false;
        this.isDead = false;
    }

    /**
     * Update survival stats
     * @param {number} deltaTime - Time in seconds
     */
    update(deltaTime) {
        if (this.isDead) return;

        // Decay hunger and thirst
        this.hunger = Math.max(0, this.hunger - this.hungerDecayRate * deltaTime);
        this.thirst = Math.max(0, this.thirst - this.thirstDecayRate * deltaTime);

        // Check for damage conditions
        this.isStarving = this.hunger < this.damageThreshold;
        this.isDehydrated = this.thirst < this.damageThreshold;

        // Apply damage if starving/dehydrated
        let totalDamage = 0;
        if (this.isStarving) {
            totalDamage += this.starvationDamage * deltaTime;
        }
        if (this.isDehydrated) {
            totalDamage += this.dehydrationDamage * deltaTime;
        }

        if (totalDamage > 0) {
            this.health = Math.max(0, this.health - totalDamage);
            this.scene.events.emit('survivalDamage', { damage: totalDamage, health: this.health });
        }

        // Health regeneration when well-fed
        if (this.hunger > this.healthRegenThreshold &&
            this.thirst > this.healthRegenThreshold &&
            this.health < 100) {
            this.health = Math.min(100, this.health + this.healthRegenRate * deltaTime);
        }

        // Check for death
        if (this.health <= 0) {
            this.die();
        }

        // Emit warnings
        this.checkWarnings();

        // Emit update event for UI
        this.scene.events.emit('survivalUpdate', this.getStats());
    }

    /**
     * Eat food to restore hunger
     * @param {Object} foodItem - Food item from ItemTypes
     * @returns {boolean} True if consumed
     */
    eat(foodItem) {
        if (!foodItem || !foodItem.nutrition) return false;

        const previousHunger = this.hunger;
        this.hunger = Math.min(100, this.hunger + foodItem.nutrition);

        // Play eating sound
        if (this.scene.sound) {
            this.scene.sound.play('eat', { volume: 0.5 });
        }

        this.scene.events.emit('survivalUpdate', this.getStats());

        return this.hunger > previousHunger;
    }

    /**
     * Drink water to restore thirst
     * @param {Object} waterItem - Water item from ItemTypes
     * @returns {boolean} True if consumed
     */
    drink(waterItem) {
        if (!waterItem || !waterItem.hydration) return false;

        const previousThirst = this.thirst;
        this.thirst = Math.min(100, this.thirst + waterItem.hydration);

        // Play drinking sound
        if (this.scene.sound) {
            this.scene.sound.play('drink', { volume: 0.5 });
        }

        this.scene.events.emit('survivalUpdate', this.getStats());

        return this.thirst > previousThirst;
    }

    /**
     * Take direct damage (from hazards, etc.)
     * @param {number} amount - Damage amount
     */
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);

        if (this.health <= 0) {
            this.die();
        }

        this.scene.events.emit('survivalUpdate', this.getStats());
    }

    /**
     * Heal health directly
     * @param {number} amount
     */
    heal(amount) {
        this.health = Math.min(100, this.health + amount);
        this.scene.events.emit('survivalUpdate', this.getStats());
    }

    /**
     * Check and emit warning events
     */
    checkWarnings() {
        // Hunger warnings
        if (this.hunger <= this.criticalThreshold && this.hunger > 0) {
            this.scene.events.emit('survivalCritical', { type: 'hunger', value: this.hunger });
        } else if (this.hunger <= this.warningThreshold) {
            this.scene.events.emit('survivalWarning', { type: 'hunger', value: this.hunger });
        }

        // Thirst warnings
        if (this.thirst <= this.criticalThreshold && this.thirst > 0) {
            this.scene.events.emit('survivalCritical', { type: 'thirst', value: this.thirst });
        } else if (this.thirst <= this.warningThreshold) {
            this.scene.events.emit('survivalWarning', { type: 'thirst', value: this.thirst });
        }

        // Health warnings
        if (this.health <= this.criticalThreshold && this.health > 0) {
            this.scene.events.emit('survivalCritical', { type: 'health', value: this.health });
        } else if (this.health <= this.warningThreshold) {
            this.scene.events.emit('survivalWarning', { type: 'health', value: this.health });
        }
    }

    /**
     * Handle player death
     */
    die() {
        if (this.isDead) return;

        this.isDead = true;
        this.health = 0;

        this.scene.events.emit('playerDeath', {
            cause: this.isDehydrated ? 'dehydration' : (this.isStarving ? 'starvation' : 'unknown')
        });
    }

    /**
     * Reset survival stats (for respawn)
     */
    reset() {
        this.hunger = 100;
        this.thirst = 100;
        this.health = 100;
        this.isStarving = false;
        this.isDehydrated = false;
        this.isDead = false;

        this.scene.events.emit('survivalUpdate', this.getStats());
    }

    /**
     * Get current survival stats
     * @returns {Object}
     */
    getStats() {
        return {
            hunger: this.hunger,
            thirst: this.thirst,
            health: this.health,
            isStarving: this.isStarving,
            isDehydrated: this.isDehydrated,
            isDead: this.isDead
        };
    }

    /**
     * Set stats (for loading saves)
     * @param {Object} stats
     */
    setStats(stats) {
        if (stats.hunger !== undefined) this.hunger = stats.hunger;
        if (stats.thirst !== undefined) this.thirst = stats.thirst;
        if (stats.health !== undefined) this.health = stats.health;
        this.scene.events.emit('survivalUpdate', this.getStats());
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SurvivalSystem };
}
