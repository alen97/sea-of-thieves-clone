////////////////////////////////////////////////// SHIP FUNCTIONS

function addShip(self, shipInfo) {
    // Crear el barco con dimensiones correctas (55x110)
    const ship = self.physics.add.sprite(shipInfo.x, shipInfo.y, 'ship')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(78, 170);

    ship.playerId = shipInfo.playerId || 'unknown';
    ship.setMaxVelocity(300);
    ship.setDepth(2);
    ship.body.collideWorldBounds = false;

    // Estado del barco
    ship.health = shipInfo.health || 100;
    ship.damages = []; // Array de sprites de roturas
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
        .setDisplaySize(55, 110);

    ship.playerId = shipInfo.playerId;
    ship.setRotation(shipInfo.rotation);
    ship.damages = [];

    // Agregar roturas si existen
    if (shipInfo.damages && shipInfo.damages.length > 0) {
        shipInfo.damages.forEach(damage => {
            const damageSprite = self.add.rectangle(
                shipInfo.x + damage.x,
                shipInfo.y + damage.y,
                10, 10, 0xff0000
            );
            damageSprite.setDepth(2);
            damageSprite.damageId = damage.id;
            ship.damages.push(damageSprite);
        });
    }

    return ship;
}

function updateShip(self, ship, isControlled, input) {
    // Variables globales de física del barco
    const constantSpeed = 100; // Velocidad constante del barco
    const turnSpeed = 15; // Velocidad de giro (reducida para navegación más suave)
    const maxSteeringDirection = 100;
    const steeringIncrement = 1;

    // El barco SIEMPRE mantiene su velocidad/rotación independientemente

    if (isControlled && input) {
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

        // Resetear dirección si está centrado
        if ((self.steeringDirection >= -3 && self.steeringDirection <= 3) &&
            !(input.keyA.isDown || input.keyD.isDown)) {
            self.steeringDirection = 0;
        }
    }

    // SIEMPRE aplicar la velocidad angular basada en steeringDirection
    // (tanto si está en el timón como si no)
    const angularVelocity = self.steeringDirection / maxSteeringDirection * turnSpeed;
    ship.setAngularVelocity(angularVelocity);

    // Calcular dirección del barco
    const shipAngle = ship.rotation - Math.PI / 2;

    // Aplicar aceleración/desaceleración gradual
    if (ship.isAnchored) {
        // Ancla bajada - desacelerar gradualmente hacia 0
        ship.currentSpeed *= 0.99;

        // También reducir la velocidad angular con ancla
        ship.setAngularVelocity(angularVelocity * 0.99);
    } else {
        // Sin ancla - acelerar gradualmente hacia velocidad constante
        // Factor más bajo = aceleración más lenta
        ship.currentSpeed += (constantSpeed - ship.currentSpeed) * 0.003;
    }

    // Aplicar la velocidad actual en la dirección del barco
    const velocityX = Math.cos(shipAngle) * ship.currentSpeed;
    const velocityY = Math.sin(shipAngle) * ship.currentSpeed;

    ship.setVelocity(velocityX, velocityY);

    // Siempre aplicar wrap al barco
    self.physics.world.wrap(ship, 0);

    // Sistema de degradación de salud por roturas
    if (ship.damages.length > 0) {
        const healthLossPerFrame = (ship.damages.length * 0.5) / 60;
        ship.health -= healthLossPerFrame;
        ship.health = Math.max(0, ship.health);

        // Emitir actualización de salud cada cierto tiempo
        if (!self.lastHealthUpdate || Date.now() - self.lastHealthUpdate > 500) {
            self.socket.emit('shipHealthUpdate', { health: ship.health });
            self.lastHealthUpdate = Date.now();
        }
    }
}

function setupShipCollisions(self, ship) {
    // Colisión de balas con el BARCO
    self.physics.add.overlap(ship, self.otherBullets, function (shipObj, bullet) {
        if (shipObj.playerId !== bullet.shooterId) {
            // Crear rotura en el punto de impacto
            const damageId = Date.now() + Math.random();

            // Crear sprite de rotura (cuadrado rojo)
            const damageSprite = self.add.rectangle(bullet.x, bullet.y, 10, 10, 0xff0000);
            damageSprite.setDepth(2);
            damageSprite.damageId = damageId;

            shipObj.damages.push(damageSprite);

            // Emitir daño al servidor
            self.socket.emit('shipDamaged', {
                x: bullet.x - shipObj.x,
                y: bullet.y - shipObj.y,
                id: damageId
            });

            bullet.destroy();
            self.cameras.main.shake(200, 0.02);
        }
    }, null, self);
}
