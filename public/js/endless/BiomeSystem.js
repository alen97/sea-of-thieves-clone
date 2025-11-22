/**
 * Biome System for Endless Sea of Rooms
 * Procedural generation of different sea biomes using Perlin noise
 */

// Simple Perlin noise implementation
class PerlinNoise {
    constructor(seed = Math.random() * 10000) {
        this.seed = seed;
        this.permutation = this.generatePermutation();
    }

    generatePermutation() {
        const p = [];
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }

        // Shuffle using seed
        let random = this.seed;
        for (let i = 255; i > 0; i--) {
            random = (random * 16807) % 2147483647;
            const j = Math.floor((random / 2147483647) * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }

        // Duplicate for overflow
        return [...p, ...p];
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);

        const u = this.fade(x);
        const v = this.fade(y);

        const p = this.permutation;
        const A = p[X] + Y;
        const B = p[X + 1] + Y;

        return this.lerp(v,
            this.lerp(u, this.grad(p[A], x, y), this.grad(p[B], x - 1, y)),
            this.lerp(u, this.grad(p[A + 1], x, y - 1), this.grad(p[B + 1], x - 1, y - 1))
        );
    }

    // Octave noise for more natural patterns
    octaveNoise(x, y, octaves = 4, persistence = 0.5) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        return total / maxValue;
    }
}

// Biome definitions
const BIOMES = {
    CALM_SEA: {
        id: 'calm_sea',
        name: 'Calm Sea',
        color: 0x1E90FF,
        waveIntensity: 0.3,
        hazardChance: 0.05,
        fishChance: 0.8,
        chestChance: 0.1,
        fogDensity: 0,
        lightLevel: 1.0
    },
    STORMY_SEA: {
        id: 'stormy_sea',
        name: 'Stormy Sea',
        color: 0x2F4F4F,
        waveIntensity: 1.0,
        hazardChance: 0.4,
        fishChance: 0.5,
        chestChance: 0.2,
        fogDensity: 0.3,
        lightLevel: 0.6
    },
    CORAL_REEF: {
        id: 'coral_reef',
        name: 'Coral Reef',
        color: 0x00CED1,
        waveIntensity: 0.2,
        hazardChance: 0.1,
        fishChance: 1.0,
        chestChance: 0.15,
        fogDensity: 0,
        lightLevel: 1.1
    },
    DEEP_ABYSS: {
        id: 'deep_abyss',
        name: 'Deep Abyss',
        color: 0x191970,
        waveIntensity: 0.5,
        hazardChance: 0.6,
        fishChance: 0.3,
        chestChance: 0.3,
        fogDensity: 0.5,
        lightLevel: 0.4
    },
    KELP_FOREST: {
        id: 'kelp_forest',
        name: 'Kelp Forest',
        color: 0x228B22,
        waveIntensity: 0.4,
        hazardChance: 0.15,
        fishChance: 0.9,
        chestChance: 0.1,
        fogDensity: 0.2,
        lightLevel: 0.8
    }
};

class BiomeSystem {
    constructor(scene) {
        this.scene = scene;
        this.noise = new PerlinNoise();
        this.currentBiome = BIOMES.CALM_SEA;

        // Cache for visited rooms
        this.biomeCache = new Map();

        // Visual elements
        this.fogOverlay = null;
        this.currentColor = 0x1E90FF;
    }

    /**
     * Get biome for a specific room
     * @param {number} roomX - Room X coordinate
     * @param {number} roomY - Room Y coordinate
     * @returns {Object} Biome object
     */
    getBiome(roomX, roomY) {
        const cacheKey = `${roomX},${roomY}`;

        // Check cache
        if (this.biomeCache.has(cacheKey)) {
            return this.biomeCache.get(cacheKey);
        }

        // Generate biome using noise
        const scale = 0.08;
        const noiseValue = this.noise.octaveNoise(roomX * scale, roomY * scale, 4, 0.5);

        // Map noise to biome
        let biome;
        if (noiseValue < -0.3) {
            biome = BIOMES.DEEP_ABYSS;
        } else if (noiseValue < -0.1) {
            biome = BIOMES.STORMY_SEA;
        } else if (noiseValue < 0.2) {
            biome = BIOMES.CALM_SEA;
        } else if (noiseValue < 0.4) {
            biome = BIOMES.KELP_FOREST;
        } else {
            biome = BIOMES.CORAL_REEF;
        }

        // Cache result
        this.biomeCache.set(cacheKey, biome);

        return biome;
    }

    /**
     * Apply biome visuals to scene
     * @param {Object} biome - Biome to apply
     */
    applyBiomeVisuals(biome) {
        if (!biome) return;

        this.currentBiome = biome;

        // Tween ocean color
        const targetColor = biome.color;
        this.tweenColor(this.currentColor, targetColor, 1000);

        // Update fog
        this.updateFog(biome.fogDensity);

        // Update lighting
        if (this.scene.lights) {
            this.scene.lights.setAmbientColor(
                Phaser.Display.Color.GetColor(
                    255 * biome.lightLevel,
                    255 * biome.lightLevel,
                    255 * biome.lightLevel
                )
            );
        }

        // Emit biome change event
        this.scene.events.emit('biomeChanged', biome);
    }

    /**
     * Smoothly transition ocean color
     * @param {number} fromColor
     * @param {number} toColor
     * @param {number} duration
     */
    tweenColor(fromColor, toColor, duration) {
        const from = Phaser.Display.Color.IntegerToColor(fromColor);
        const to = Phaser.Display.Color.IntegerToColor(toColor);

        this.scene.tweens.addCounter({
            from: 0,
            to: 100,
            duration: duration,
            onUpdate: (tween) => {
                const value = tween.getValue() / 100;
                const r = Phaser.Math.Linear(from.red, to.red, value);
                const g = Phaser.Math.Linear(from.green, to.green, value);
                const b = Phaser.Math.Linear(from.blue, to.blue, value);
                const color = Phaser.Display.Color.GetColor(r, g, b);

                // Apply to ocean tilesprite
                if (this.scene.ocean) {
                    this.scene.ocean.setTint(color);
                }

                this.currentColor = color;
            }
        });
    }

    /**
     * Update fog overlay
     * @param {number} density - 0 to 1
     */
    updateFog(density) {
        if (!this.fogOverlay) {
            this.fogOverlay = this.scene.add.rectangle(
                0, 0,
                this.scene.cameras.main.width,
                this.scene.cameras.main.height,
                0x808080
            );
            this.fogOverlay.setScrollFactor(0);
            this.fogOverlay.setDepth(1000);
            this.fogOverlay.setAlpha(0);
        }

        this.scene.tweens.add({
            targets: this.fogOverlay,
            alpha: density * 0.5,
            duration: 1000
        });
    }

    /**
     * Get spawn chances for current biome
     * @returns {Object} Spawn chances
     */
    getSpawnChances() {
        return {
            hazard: this.currentBiome.hazardChance,
            fish: this.currentBiome.fishChance,
            chest: this.currentBiome.chestChance
        };
    }

    /**
     * Handle room transition
     * @param {number} newRoomX
     * @param {number} newRoomY
     */
    onRoomTransition(newRoomX, newRoomY) {
        const newBiome = this.getBiome(newRoomX, newRoomY);

        if (newBiome.id !== this.currentBiome.id) {
            this.applyBiomeVisuals(newBiome);
        }
    }

    /**
     * Get current biome
     * @returns {Object}
     */
    getCurrentBiome() {
        return this.currentBiome;
    }

    /**
     * Clear biome cache (for memory management)
     * @param {number} currentRoomX
     * @param {number} currentRoomY
     * @param {number} radius - Keep rooms within this radius
     */
    clearDistantCache(currentRoomX, currentRoomY, radius = 10) {
        for (const [key, value] of this.biomeCache.entries()) {
            const [x, y] = key.split(',').map(Number);
            if (Math.abs(x - currentRoomX) > radius || Math.abs(y - currentRoomY) > radius) {
                this.biomeCache.delete(key);
            }
        }
    }

    /**
     * Clean up
     */
    destroy() {
        if (this.fogOverlay) {
            this.fogOverlay.destroy();
        }
        this.biomeCache.clear();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BiomeSystem, BIOMES, PerlinNoise };
}
