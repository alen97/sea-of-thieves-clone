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

function updateShip(self, ship, isControlled, input, inputEnabled = true) {
    // Variables globales de física del barco
    const constantSpeed = 100; // Velocidad constante del barco
    const turnSpeed = 5; // Velocidad de giro (reducida para navegación más suave)
    const maxSteeringDirection = 100;
    const steeringIncrement = 1;

    // Guardar la rotación anterior para calcular el cambio
    ship.previousRotation = ship.rotation;

    // El barco SIEMPRE mantiene su velocidad/rotación independientemente

    if (inputEnabled && isControlled && input) {
        // El jugador está en el timón - puede MODIFICAR la dirección del timón

        // Control de dirección (A/D) - Modifica el steeringDirection
        if (input.keyA.isDown) {
            self.steeringDirection = Phaser.Math.Clamp(
                self.steeringDirection - steeringIncrement,
                -maxSteeringDirection,
                maxSteeringDirection
            );
        } else if (input.keyD.isDown) {
            self.steeringDirection = Phaser.Math.Clamp(
                self.steeringDirection + steeringIncrement,
                -maxSteeringDirection,
                maxSteeringDirection
            );
        }

        // Auto-centrado: resetear dirección si está cerca del centro y no se presiona A/D
        if ((self.steeringDirection >= -5 && self.steeringDirection <= 5) &&
            !(input.keyA.isDown || input.keyD.isDown)) {
            self.steeringDirection = 0;
        }
    }

    // Client-side prediction: el jugador que controla el timón tiene autoridad sobre steeringDirection
    // El servidor sincroniza con otros jugadores, pero no sobrescribe al controlador activo
    // Auto-centrado aplicado solo cuando el jugador está en el timón para navegación más natural

    // SIEMPRE aplicar la velocidad angular basada en steeringDirection
    // (tanto si está en el timón como si no)
    const angularVelocity = self.steeringDirection / maxSteeringDirection * turnSpeed;
    ship.setAngularVelocity(angularVelocity);

    // Calcular dirección del barco
    const shipAngle = ship.rotation - Math.PI / 2;

    // Aplicar aceleración/desaceleración gradual
    if (ship.isAnchored) {
        // Ancla bajada - desacelerar gradualmente hacia 0
        ship.currentSpeed *= 0.995;

        // También reducir la velocidad angular con ancla
        ship.setAngularVelocity(angularVelocity * 0.995);
    } else {
        // Sin ancla - acelerar gradualmente hacia velocidad constante
        // Factor más bajo = aceleración más lenta
        ship.currentSpeed += (constantSpeed - ship.currentSpeed) * 0.003;
    }

    // Aplicar la velocidad actual en la dirección del barco
    const velocityX = Math.cos(shipAngle) * ship.currentSpeed;
    const velocityY = Math.sin(shipAngle) * ship.currentSpeed;

    ship.setVelocity(velocityX, velocityY);
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
