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
