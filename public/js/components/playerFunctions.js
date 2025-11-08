////////////////////////////////////////////////// ADD PLAYER AND ADDOTHERPLAYER FUNCTIONS
function addPlayer(self, playerInfo) {
    // Crear el barco (ahora 3x más grande: 60x132)
    self.ship = self.physics.add.sprite(playerInfo.ship.x, playerInfo.ship.y, 'ship')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(60, 132);

    self.ship.playerId = playerInfo.playerId;
    self.ship.setMaxVelocity(300);
    self.ship.setDepth(2);
    self.ship.body.collideWorldBounds = false;
    self.ship.health = playerInfo.ship.health || 100;
    self.ship.damages = []; // Array de sprites de roturas

    // Crear el jugador (cuadrado negro 8x8)
    self.player = self.physics.add.sprite(
        playerInfo.ship.x + playerInfo.player.x,
        playerInfo.ship.y + playerInfo.player.y,
        24, 15, 0x000000
    );
    self.player.setDepth(3);
    self.player.isControllingShip = false;

    // La cámara inicialmente sigue al jugador
    self.cameras.main.startFollow(self.player, 1, 1);

    // Inicializar oldPosition para evitar errores en el primer frame
    self.ship.oldPosition = {
        x: self.ship.x,
        y: self.ship.y,
        rotation: self.ship.rotation,
        playerX: 0,
        playerY: 0
    };

    // Colisión de balas con el BARCO (no con el jugador)
    self.physics.add.overlap(self.ship, self.otherBullets, function (ship, bullet) {
        if (ship.playerId !== bullet.shooterId) {
            // Crear rotura en el punto de impacto
            const damageId = Date.now() + Math.random();

            // Crear sprite de rotura (cuadrado rojo)
            const damageSprite = self.add.rectangle(bullet.x, bullet.y, 10, 10, 0xff0000);
            damageSprite.setDepth(2);
            damageSprite.damageId = damageId;

            self.ship.damages.push(damageSprite);

            // Emitir daño al servidor
            self.socket.emit('shipDamaged', {
                x: bullet.x - ship.x,
                y: bullet.y - ship.y,
                id: damageId
            });

            bullet.destroy();
            self.cameras.main.shake(200, 0.02);
        }
    }, null, self);

}

function addOtherPlayers(self, playerInfo) {
    // Crear el barco del otro jugador (60x132)
    const otherShip = self.add.sprite(playerInfo.ship.x, playerInfo.ship.y, 'ship')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(60, 132);

    otherShip.playerId = playerInfo.playerId;
    otherShip.setRotation(playerInfo.ship.rotation);
    otherShip.damages = [];

    // Crear el jugador del otro (cuadrado negro)
    const otherPlayerSprite = self.add.rectangle(
        playerInfo.ship.x + playerInfo.player.x,
        playerInfo.ship.y + playerInfo.player.y,
        8, 8, 0x000000
    );
    otherPlayerSprite.setDepth(3);

    // Guardar referencia al jugador en el barco
    otherShip.playerSprite = otherPlayerSprite;

    // Agregar roturas si existen
    if (playerInfo.ship.damages && playerInfo.ship.damages.length > 0) {
        playerInfo.ship.damages.forEach(damage => {
            const damageSprite = self.add.rectangle(
                playerInfo.ship.x + damage.x,
                playerInfo.ship.y + damage.y,
                10, 10, 0xff0000
            );
            damageSprite.setDepth(2);
            damageSprite.damageId = damage.id;
            otherShip.damages.push(damageSprite);
        });
    }

    self.otherPlayers.add(otherShip);
}
