/**
 * Hazard System for Endless Sea of Rooms
 * Manages tornados and other deadly hazards
 */

class HazardSystem {
    constructor(scene) {
        this.scene = scene;

        // Active hazards
        this.tornados = [];

        // Settings
        this.maxTornados = 3;
        this.tornadoRadius = 80;
        this.tornadoSpeed = 60;
        this.spawnCooldown = 10000; // ms between spawns
        this.lastSpawnTime = 0;

        // Death zone (instant kill)
        this.deathRadius = 50;
    }

    /**
     * Spawn a tornado at position
     * @param {number} x
     * @param {number} y
     * @returns {Object} Tornado object
     */
    spawnTornado(x, y) {
        if (this.tornados.length >= this.maxTornados) return null;

        // Create tornado sprite
        const sprite = this.scene.add.sprite(x, y, 'tornado');
        sprite.setScale(0.8);

        // Add spinning animation
        this.scene.tweens.add({
            targets: sprite,
            angle: 360,
            duration: 2000,
            repeat: -1
        });

        // Create particles for wind effect
        const particles = this.scene.add.particles(x, y, 'wind_particle', {
            speed: { min: 50, max: 150 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.3, end: 0 },
            alpha: { start: 0.6, end: 0 },
            lifespan: 800,
            frequency: 30,
            quantity: 2
        });

        const tornado = {
            id: Date.now() + Math.random(),
            x: x,
            y: y,
            sprite: sprite,
            particles: particles,
            direction: Math.random() * Math.PI * 2,
            speed: this.tornadoSpeed + Math.random() * 30,
            changeTimer: 0,
            changeInterval: 2000 + Math.random() * 2000
        };

        this.tornados.push(tornado);

        // Play spawn sound
        if (this.scene.sound) {
            this.scene.sound.play('tornado_spawn', { volume: 0.6 });
        }

        return tornado;
    }

    /**
     * Remove a tornado
     * @param {Object} tornado
     */
    removeTornado(tornado) {
        tornado.sprite.destroy();
        tornado.particles.destroy();

        const index = this.tornados.indexOf(tornado);
        if (index > -1) {
            this.tornados.splice(index, 1);
        }
    }

    /**
     * Update all tornados
     * @param {number} time - Current time
     * @param {number} deltaTime - Time since last update in seconds
     * @param {Object} boat - Boat object to check collision
     */
    update(time, deltaTime, boat) {
        const deltaMs = deltaTime * 1000;

        for (const tornado of this.tornados) {
            // Update direction change timer
            tornado.changeTimer += deltaMs;

            if (tornado.changeTimer >= tornado.changeInterval) {
                // Change direction randomly
                tornado.direction += (Math.random() - 0.5) * Math.PI;
                tornado.changeTimer = 0;
                tornado.changeInterval = 2000 + Math.random() * 2000;
            }

            // Move tornado
            tornado.x += Math.cos(tornado.direction) * tornado.speed * deltaTime;
            tornado.y += Math.sin(tornado.direction) * tornado.speed * deltaTime;

            // Update sprite position
            tornado.sprite.x = tornado.x;
            tornado.sprite.y = tornado.y;
            tornado.particles.x = tornado.x;
            tornado.particles.y = tornado.y;

            // Check boat collision
            if (boat) {
                const dx = boat.state.x - tornado.x;
                const dy = boat.state.y - tornado.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Warning zone
                if (distance < this.tornadoRadius * 2) {
                    this.scene.events.emit('hazardNear', {
                        type: 'tornado',
                        distance: distance,
                        tornado: tornado
                    });
                }

                // Death zone
                if (distance < this.deathRadius) {
                    this.killPlayer(tornado);
                }
            }
        }

        // Remove tornados that left the room
        this.tornados = this.tornados.filter(tornado => {
            if (tornado.x < -200 || tornado.x > 3400 ||
                tornado.y < -200 || tornado.y > 3400) {
                tornado.sprite.destroy();
                tornado.particles.destroy();
                return false;
            }
            return true;
        });
    }

    /**
     * Kill player when caught by tornado
     * @param {Object} tornado
     */
    killPlayer(tornado) {
        // Play death sound
        if (this.scene.sound) {
            this.scene.sound.play('tornado_death', { volume: 0.8 });
        }

        // Emit death event
        this.scene.events.emit('playerDeath', {
            cause: 'tornado',
            hazard: tornado
        });
    }

    /**
     * Try to spawn hazards based on biome chance
     * @param {number} time - Current time
     * @param {number} hazardChance - Spawn chance (0-1)
     * @param {number} roomX - Current room X
     * @param {number} roomY - Current room Y
     */
    trySpawnHazard(time, hazardChance, roomX, roomY) {
        if (time - this.lastSpawnTime < this.spawnCooldown) return;

        if (Math.random() < hazardChance) {
            // Spawn at random position in room (away from center)
            const angle = Math.random() * Math.PI * 2;
            const distance = 800 + Math.random() * 600;

            const x = 1600 + Math.cos(angle) * distance;
            const y = 1600 + Math.sin(angle) * distance;

            this.spawnTornado(x, y);
            this.lastSpawnTime = time;
        }
    }

    /**
     * Clear all hazards (for room transitions)
     */
    clearAll() {
        for (const tornado of this.tornados) {
            tornado.sprite.destroy();
            tornado.particles.destroy();
        }
        this.tornados = [];
    }

    /**
     * Get distance to nearest hazard
     * @param {number} x
     * @param {number} y
     * @returns {number} Distance to nearest hazard
     */
    getNearestHazardDistance(x, y) {
        let minDistance = Infinity;

        for (const tornado of this.tornados) {
            const dx = x - tornado.x;
            const dy = y - tornado.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            minDistance = Math.min(minDistance, distance);
        }

        return minDistance;
    }

    /**
     * Get all active hazard positions
     * @returns {Array} Array of {x, y, type}
     */
    getHazardPositions() {
        return this.tornados.map(tornado => ({
            x: tornado.x,
            y: tornado.y,
            type: 'tornado'
        }));
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
    module.exports = { HazardSystem };
}
