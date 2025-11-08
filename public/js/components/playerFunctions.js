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

        // IMPORTANTE: Heredar movimiento del barco
        // El jugador se mueve junto con el barco para mantener su posición relativa
        player.x += ship.body.velocity.x * deltaTime;
        player.y += ship.body.velocity.y * deltaTime;

        // Mantener jugador dentro del barco (55x110)
        const shipBoundsWidth = 55;
        const shipBoundsHeight = 110;

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
    }
}
