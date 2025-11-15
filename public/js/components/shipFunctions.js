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
    // Colisión de balas con el BARCO (sin daño)
    self.physics.add.overlap(ship, self.otherBullets, function (shipObj, bullet) {
        if (shipObj.playerId !== bullet.shooterId) {
            // Destruir bala al impactar (sin causar daño)
            bullet.destroy();
        }
    }, null, self);
}
