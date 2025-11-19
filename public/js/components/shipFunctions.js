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

    // Create damage smoke particles (initially invisible)
    const smokeParticles = self.add.particles('bullet');
    const smokeEmitter = smokeParticles.createEmitter({
        x: 0,
        y: 0,
        speed: { min: 20, max: 40 },
        angle: { min: -100, max: -80 }, // Upward
        scale: { start: 0.3, end: 1.5 },
        alpha: { start: 0.6, end: 0 },
        lifespan: 2000,
        frequency: 200,
        tint: [0x555555, 0x777777, 0x333333], // Gray smoke
        blendMode: 'NORMAL',
        on: false // Start stopped
    });
    smokeParticles.setDepth(1.5); // Below ship but above ocean

    // Store references
    ship.healthBarBg = healthBarBg;
    ship.healthBar = healthBar;
    ship.healthBarWidth = barWidth;
    ship.healthBarHeight = barHeight;
    ship.healthBarOffsetY = barY;
    ship.damageSmoke = smokeEmitter;

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

    // Handle damage smoke effect (health < 30)
    if (ship.damageSmoke) {
        if (currentHealth < 30 && currentHealth > 0) {
            // Start smoke if not already emitting
            if (!ship.damageSmoke.on) {
                ship.damageSmoke.start();
            }
            // Update smoke position to ship center
            ship.damageSmoke.setPosition(ship.x, ship.y);
        } else {
            // Stop smoke if health >= 30 or ship sunk
            if (ship.damageSmoke.on) {
                ship.damageSmoke.stop();
            }
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
