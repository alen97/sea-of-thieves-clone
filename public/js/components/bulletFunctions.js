////////////////////////////////////////////////// ADD BULLET AND ADDOTHERBULLET FUNCTIONS

function addBullet(self, creationData) {
  console.log("CREATE BULLET!");

  const bullet = self.physics.add.sprite(creationData.x, creationData.y, 'bullet').setOrigin(0.5, 0.5).setDisplaySize(12, 12);

  // Apply color tint if specified (for Abyss Lantern modifier)
  if (creationData.color) {
    bullet.setTint(creationData.color);
  }

  const shoot = self.sound.add('shoot');

  // LOGICA DE VOLUMEN DEPENDIENDO DISTANCIA
  const distance = Phaser.Math.Distance.Between(self.ship.x, self.ship.y, creationData.x, creationData.y);

  function calculateVolume(distance, maxDistance) {
    return Math.max(0, 1 - distance / maxDistance);
  }

  const maxDistance = 800;
  const volume = calculateVolume(distance, maxDistance);
  console.log("SHOT VOLUME: ", 2 * volume);

  shoot.setVolume(2 * volume);
  shoot.play();

  // Efecto de cámara (sacudida)
  self.cameras.main.shake(100, 0.003);

  bullet.shooterId = creationData.shooterId;
  self.otherBullets.add(bullet);
  bullet.setRotation(creationData.rotation);

  console.log("=== BULLET DEBUG ===");
  console.log("My ship:", self.ship.playerId, "at", self.ship.x, self.ship.y);
  console.log("Shooter:", creationData.shooterId);
  console.log("Bullet pos:", creationData.x, creationData.y);
  console.log("Am I shooter?", self.ship.playerId === creationData.shooterId);
  console.log("Bullet depth:", bullet.depth);
  console.log("Bullet visible:", bullet.visible);
  console.log("Bullet alpha:", bullet.alpha);
  console.log("BULLET: ", bullet);
  console.log("creationData: ", creationData);
  console.log("[BULLET] Will this bullet be destroyed by collision? ship.playerId !== bullet.shooterId:", self.ship.playerId !== creationData.shooterId);

  // Usar las velocidades ya calculadas en lugar de recalcular
  bullet.setVelocity(creationData.velocityX, creationData.velocityY);

  function destroyBullet() {
    if (self.otherBullets.contains(bullet)) {
      bullet.destroy();
    }
  }
  setTimeout(destroyBullet, 1000);
}
