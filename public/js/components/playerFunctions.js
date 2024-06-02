////////////////////////////////////////////////// ADD PLAYER AND ADDOTHERPLAYER FUNCTIONS
function addPlayer(self, playerInfo) {
    self.ship = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'ship').setOrigin(0.5, 0.5).setDisplaySize(20, 44);
    // game.camera.follow(self.ship);
    self.cameras.main.startFollow(self.ship, 1, 1);
    // console.log("ADD PLAYER TEXTURE KEY ", self.ship.texture.key)
    playerInfo.sprite = self.ship.texture.key;

    self.ship.playerId = playerInfo.playerId;

    // self.ship.setDrag(100);
    // self.ship.setAngularDrag(100);
    self.ship.setMaxVelocity(300);

    self.ship.setDepth(2)

    self.ship.body.collideWorldBounds = false;

    self.ship.invulnerable = false;

    self.ship.speed = 150;

    // DEATH
    self.physics.add.overlap(self.ship, self.otherBullets, function (player, bullet) {

        if (!self.ship.dead) {
            console.log("PLAYER ID: ", player.playerId)
            console.log("SHOOTER ID: ", bullet.shooterId)
            if (player.playerId !== bullet.shooterId) { // Si la bullet no fue creada por el mismo player

                self.cameras.main.shake(300, 0.03)
                self.ship.dead = true;
                self.ship.setTexture("playerMuerto")

                bullet.destroy() // Destruye la bala sólo si no disparaste vos
                self.ship.setVelocityX(0);
                self.ship.setVelocityY(0);

                self.ship.setDepth(0)

                // self.ship.anims.stop()

                // self.playerDeathSound.setVolume(0.03)
                // self.playerDeathSound.play();

                self.socket.emit('playerDied', { x: self.ship.x, y: self.ship.y, rotation: self.ship.rotation, sprite: "playerMuerto", killerId: bullet.shooterId });

            }
        }
    }, null, self);

}

function addOtherPlayers(self, playerInfo) {
    const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'ship').setOrigin(0.5, 0.5).setDisplaySize(20, 44);

    otherPlayer.playerId = playerInfo.playerId;
    // otherPlayer.sprite = self.otherPlayer ? self.otherPlayer.texture.key : "";
    // otherPlayer.sprite = playerInfo.isPlayerDead ? 'playerMuerto' : "";
    if (playerInfo.isPlayerDead) {
        otherPlayer.setTexture(playerInfo.sprite)
        otherPlayer.setRotation(playerInfo.rotation)
    }
    console.log("PLAYER INFO: ", playerInfo)
    self.otherPlayers.add(otherPlayer);
}
