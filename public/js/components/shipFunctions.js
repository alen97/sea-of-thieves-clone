////////////////////////////////////////////////// SHIP FUNCTIONS

function addShip(self, shipInfo) {
    // Crear el barco con dimensiones correctas (55x110)
    const ship = self.physics.add.sprite(shipInfo.x, shipInfo.y, 'ship')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(178, 463);

    ship.playerId = shipInfo.playerId || 'unknown';
    ship.setMaxVelocity(300);
    ship.setDepth(2);
    ship.body.collideWorldBounds = false;

    // Estado del barco
    ship.isAnchored = true; // Barco empieza con ancla puesta
    ship.currentSpeed = 0; // Velocidad actual (gradual)

    // Inicializar oldPosition para sincronización
    ship.oldPosition = {
        x: ship.x,
        y: ship.y,
        rotation: ship.rotation
    };

    return ship;
}

function addOtherShip(self, shipInfo) {
    // Crear barco de otro jugador (sin física)
    const ship = self.add.sprite(shipInfo.x, shipInfo.y, 'ship')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(178, 463);

    ship.playerId = shipInfo.playerId;
    ship.setRotation(shipInfo.rotation);

    return ship;
}

function createShipHealthBar(self, ship) {
    // Create health bar above the ship
    const barWidth = 180; // Slightly wider than ship
    const barHeight = 12;
    const barX = 0; // Relative to ship
    const barY = -250; // Above ship

    // Create background (black/dark gray)
    const healthBarBg = self.add.graphics();
    healthBarBg.fillStyle(0x000000, 0.8);
    healthBarBg.fillRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight);
    healthBarBg.setDepth(10); // High depth to always be visible

    // Create health bar (green/yellow/red based on health)
    const healthBar = self.add.graphics();
    healthBar.setDepth(10);

    // Create leak water particles (initially invisible) - water rushing into ship
    const waterParticles = self.add.particles('bullet');
    const waterEmitter = waterParticles.createEmitter({
        x: 0,
        y: 0,
        speed: { min: 50, max: 100 },
        angle: { min: -110, max: -70 }, // Upward spray
        scaleX: { start: 0.6, end: 0.8 }, // Wider
        scaleY: { start: 0.3, end: 0.4 }, // Shorter - makes particles wider than tall
        alpha: { start: 0.9, end: 0.3 },
        lifespan: 400, // Short lifespan - discrete drops, not trails
        frequency: 80,
        tint: [0x4A90D9, 0x87CEEB, 0x5DADE2], // Blue water tones
        blendMode: 'NORMAL',
        on: false // Start stopped
    });
    waterParticles.setDepth(1.5); // Below ship but above ocean

    // Store references
    ship.healthBarBg = healthBarBg;
    ship.healthBar = healthBar;
    ship.healthBarWidth = barWidth;
    ship.healthBarHeight = barHeight;
    ship.healthBarOffsetY = barY;
    ship.leakWater = waterEmitter;
    ship.leakWaterContainer = waterParticles; // Store container for position updates

    // Hide health bar (not used)
    healthBarBg.setVisible(false);
    healthBar.setVisible(false);

    // Initialize with full health
    updateShipHealthBar(ship, 100, 100);
}

function updateShipHealthBar(ship, currentHealth, maxHealth) {
    if (!ship.healthBar) return;

    const healthPercent = Math.max(0, currentHealth / maxHealth);
    const barWidth = ship.healthBarWidth;
    const barHeight = ship.healthBarHeight;

    // Determine color based on health percentage
    let color;
    if (healthPercent > 0.7) {
        color = 0x00ff00; // Green
    } else if (healthPercent > 0.4) {
        color = 0xffff00; // Yellow
    } else {
        color = 0xff0000; // Red
    }

    // Clear and redraw health bar
    ship.healthBar.clear();
    ship.healthBar.fillStyle(color, 1);
    ship.healthBar.fillRect(
        -barWidth / 2,
        -barHeight / 2,
        barWidth * healthPercent,
        barHeight
    );

    // Update position to follow ship
    ship.healthBarBg.setPosition(ship.x, ship.y + ship.healthBarOffsetY);
    ship.healthBar.setPosition(ship.x, ship.y + ship.healthBarOffsetY);

    // Handle leak water effect - starts at health < 70 (or when server says isLeaking)
    if (ship.leakWater && ship.leakWaterContainer) {
        const shouldLeak = (ship.isLeaking || currentHealth < 70) && currentHealth > 0;
        if (shouldLeak) {
            // Start water if not already emitting
            if (!ship.leakWater.on) {
                ship.leakWater.start();
            }

            // Calculate leak intensity based on health (69 → minimal, 1 → maximum)
            const leakIntensity = 1 - ((currentHealth - 1) / 68); // 0 to 1

            // Scale emitter properties based on intensity
            ship.leakWater.setFrequency(100 - (80 * leakIntensity)); // 100ms → 20ms
            ship.leakWater.setSpeed({ min: 50 + (50 * leakIntensity), max: 100 + (100 * leakIntensity) }); // Faster spray
            ship.leakWater.setScaleX({ start: 0.6 + (0.4 * leakIntensity), end: 0.8 + (0.4 * leakIntensity) }); // Wider
            ship.leakWater.setScaleY({ start: 0.3 + (0.2 * leakIntensity), end: 0.4 + (0.2 * leakIntensity) }); // Shorter
            ship.leakWater.setQuantity(1 + Math.floor(4 * leakIntensity)); // 1 → 5 particles per emission

            // Calculate hatch position (same offsets as RepairSystem)
            const hatchOffsetX = -57; // Slightly to the right of helm
            const hatchOffsetY = 0; // Below helm
            const angle = ship.rotation - Math.PI / 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rotatedX = hatchOffsetX * cos - hatchOffsetY * sin;
            const rotatedY = hatchOffsetX * sin + hatchOffsetY * cos;

            // Update container position to follow ship's hatch
            ship.leakWaterContainer.setPosition(ship.x + rotatedX, ship.y + rotatedY);
        } else {
            // Stop water if not leaking or ship sunk
            if (ship.leakWater.on) {
                ship.leakWater.stop();
            }
        }
    }

    // Handle ship sinking visual
    if (currentHealth <= 0) {
        // Ship fully sunk - hide completely
        if (ship.visible !== false) {
            ship.setVisible(false);
            // Hide cannons
            if (ship.cannons) {
                if (ship.cannons.left) ship.cannons.left.setVisible(false);
                if (ship.cannons.right) ship.cannons.right.setVisible(false);
            }
            // Hide hatch
            if (ship.hatchVisual) ship.hatchVisual.setVisible(false);
            console.log('[SHIP SUNK] Ship hidden (health = 0)');
        }
    } else if (currentHealth < 10) {
        // Ship sinking (health < 10) - sink below ocean
        if (ship.depth !== -1) {
            ship.setDepth(-1);
            // Sink cannons
            if (ship.cannons) {
                if (ship.cannons.left) ship.cannons.left.setDepth(-1);
                if (ship.cannons.right) ship.cannons.right.setDepth(-1);
            }
            // Sink hatch
            if (ship.hatchVisual) ship.hatchVisual.setDepth(-1);
            console.log('[SHIP SINKING] Ship depth set to -1 (below ocean)');
        }
    } else {
        // Ship is above water
        if (ship.depth !== 2) {
            ship.setDepth(2);
            // Restore cannons depth
            if (ship.cannons) {
                if (ship.cannons.left) ship.cannons.left.setDepth(2.5);
                if (ship.cannons.right) ship.cannons.right.setDepth(2.5);
            }
            // Restore hatch depth
            if (ship.hatchVisual) ship.hatchVisual.setDepth(2.5);
        }
        if (ship.visible !== true) {
            ship.setVisible(true);
            // Show cannons
            if (ship.cannons) {
                if (ship.cannons.left) ship.cannons.left.setVisible(true);
                if (ship.cannons.right) ship.cannons.right.setVisible(true);
            }
            // Show hatch
            if (ship.hatchVisual) ship.hatchVisual.setVisible(true);
        }
    }
}

function setupShipCollisions(self, ship) {
    // NOTE: Removed ship-bullet collision for shared ship
    // In a shared ship with multiple crew members, bullets from any player
    // should not collide with their own ship (they're all on the same team)
    // Bullets auto-destroy after 1 second timeout anyway

    // Colisión de balas con JELLIES (destruye la jelly)
    self.physics.add.overlap(self.otherBullets, self.jellies, function (bullet, jelly) {
        // Only process jellies (not auras)
        if (jelly.jellyId && jelly.texture && jelly.texture.key === 'abyssalJelly') {
            console.log(`[BULLET-JELLY] Bullet hit jelly ${jelly.jellyId}`);

            // Destroy bullet immediately
            bullet.destroy();

            // Emit to server to destroy the jelly for all players
            self.socket.emit('jellyDestroyed', { jellyId: jelly.jellyId });

            // Destroy jelly and its aura locally
            if (jelly.aura) {
                jelly.aura.destroy();
            }
            jelly.destroy();
        }
    }, null, self);
}
