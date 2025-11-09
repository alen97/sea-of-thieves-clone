////////////////////////////////////////////////// PLAYER FUNCTIONS

function addPlayer(self, playerInfo, ship) {
    // Crear el jugador con sprite player.png (24x15)
    const player = self.physics.add.sprite(
        ship.x + playerInfo.x,
        ship.y + playerInfo.y,
        'player'
    )
        .setOrigin(0.5, 0.5)
        .setDisplaySize(24, 15);

    player.setDepth(3);
    player.isControllingShip = false;
    player.ship = ship; // Referencia al barco

    // Jugador apunta inicialmente hacia arriba
    player.setRotation(Math.PI);

    // La cámara inicialmente sigue al jugador
    self.cameras.main.startFollow(player, 1, 1);

    return player;
}

function addOtherPlayer(self, playerInfo, ship) {
    // Crear jugador de otro (sprite player.png)
    const player = self.add.sprite(
        ship.x + playerInfo.x,
        ship.y + playerInfo.y,
        'player'
    )
        .setOrigin(0.5, 0.5)
        .setDisplaySize(24, 15);

    player.setDepth(3);

    return player;
}

function updatePlayer(self, player, ship, input, deltaTime) {
    const playerSpeed = 100;

    if (!player.isControllingShip) {
        // El jugador NO está en el timón - puede caminar

        let playerVelX = 0;
        let playerVelY = 0;

        // Input WASD
        if (input.keyW.isDown) playerVelY -= playerSpeed;
        if (input.keyS.isDown) playerVelY += playerSpeed;
        if (input.keyA.isDown) playerVelX -= playerSpeed;
        if (input.keyD.isDown) playerVelX += playerSpeed;

        // Normalizar velocidad diagonal
        if (playerVelX !== 0 && playerVelY !== 0) {
            playerVelX *= 0.707;
            playerVelY *= 0.707;
        }

        player.setVelocity(playerVelX, playerVelY);

        const directionAngles = {
            "W":  Math.PI,                  // Arriba
            "S":  0,                        // Abajo
            "A":  Math.PI / 2,              // Izquierda
            "D": -Math.PI / 2,              // Derecha
            "WA": (3 * Math.PI) / 4,        // Arriba-Izquierda
            "WD": -(3 * Math.PI) / 4,       // Arriba-Derecha
            "SA": Math.PI / 4,              // Abajo-Izquierda
            "SD": -Math.PI / 4              // Abajo-Derecha
        };

        let combo = "";
        if (input.keyW.isDown) combo += "W";
        if (input.keyS.isDown) combo += "S";
        if (input.keyA.isDown) combo += "A";
        if (input.keyD.isDown) combo += "D";

        const angle = directionAngles[combo];
        if (angle !== undefined) {
            player.setRotation(angle);
        }

        // IMPORTANTE: Heredar movimiento del barco
        // El jugador se mueve junto con el barco para mantener su posición relativa
        player.x += ship.body.velocity.x * deltaTime;
        player.y += ship.body.velocity.y * deltaTime;

        // ROTACIÓN: Si el barco giró, rotar la posición del jugador alrededor del centro del barco
        if (ship.previousRotation !== undefined) {
            const rotationDelta = ship.rotation - ship.previousRotation;

            if (rotationDelta !== 0) {
                // Calcular posición relativa del jugador al barco
                const dx = player.x - ship.x;
                const dy = player.y - ship.y;

                // Rotar el vector de posición relativa
                const cos = Math.cos(rotationDelta);
                const sin = Math.sin(rotationDelta);
                const rotatedX = dx * cos - dy * sin;
                const rotatedY = dx * sin + dy * cos;

                // Actualizar posición del jugador
                player.x = ship.x + rotatedX;
                player.y = ship.y + rotatedY;

                // También rotar el sprite visual del jugador para mantener orientación relativa al barco
                player.rotation += rotationDelta;
            }
        }

        // Mantener jugador dentro del barco (78x170 - tamaño visual del sprite)
        const shipBoundsWidth = 78;
        const shipBoundsHeight = 170;

        // Calcular posición relativa del jugador al barco
        const dx = player.x - ship.x;
        const dy = player.y - ship.y;

        // Rotar el offset del jugador según la rotación del barco
        const cosAngle = Math.cos(-ship.rotation);
        const sinAngle = Math.sin(-ship.rotation);
        const localX = dx * cosAngle - dy * sinAngle;
        const localY = dx * sinAngle + dy * cosAngle;

        // Limitar el movimiento
        const maxX = shipBoundsWidth / 2 - 12;
        const maxY = shipBoundsHeight / 2 - 7.5;
        const clampedX = Phaser.Math.Clamp(localX, -maxX, maxX);
        const clampedY = Phaser.Math.Clamp(localY, -maxY, maxY);

        // Convertir de vuelta a coordenadas del mundo
        const cosAngleBack = Math.cos(ship.rotation);
        const sinAngleBack = Math.sin(ship.rotation);
        const worldX = clampedX * cosAngleBack - clampedY * sinAngleBack;
        const worldY = clampedX * sinAngleBack + clampedY * cosAngleBack;

        player.setPosition(ship.x + worldX, ship.y + worldY);

    } else {
        // El jugador ESTÁ en el timón - no puede caminar
        player.setVelocity(0, 0);

        // Posición del timón (en la popa del barco)
        const helmOffset = 50;
        const angle = ship.rotation - Math.PI / 2;
        const helmX = ship.x - Math.cos(angle) * helmOffset;
        const helmY = ship.y - Math.sin(angle) * helmOffset;

        player.setPosition(helmX, helmY);

        // El jugador mira en la dirección del barco (hacia adelante)
        player.setRotation(ship.rotation + Math.PI);
    }
}
