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
