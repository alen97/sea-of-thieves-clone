////////////////////////////////////////////////// ADD BULLET AND ADDOTHERBULLET FUNCTIONS

function addBullet(self, creationData) {
  console.log("CREATE BULLET!");

  const bullet = self.physics.add.sprite(creationData.x, creationData.y, 'bullet').setOrigin(0.5, 0.5).setDisplaySize(12, 12);
  const shoot = self.sound.add('shoot');

  // LOGICA DE VOLUMEN DEPENDIENDO DISTANCIA
  const distance = Phaser.Math.Distance.Between(self.ship.x, self.ship.y, creationData.x, creationData.y);

  function calculateVolume(distance, maxDistance) {
    return Math.max(0, 1 - distance / maxDistance);
  }

  const maxDistance = 800;
  const volume = calculateVolume(distance, maxDistance);
  console.log("SHOT VOLUME: ", 0.4 * volume);

  shoot.setVolume(0.4 * volume);
  shoot.play();

  bullet.shooterId = creationData.shooterId;
  self.otherBullets.add(bullet);
  bullet.setRotation(creationData.rotation);

  // Ajustar la dirección del disparo basado en la dirección de rotación del barco
  let angleOffset = 0;

  if (creationData.direction === 'right') {
    angleOffset = 0;  // 0 grados (derecha)
  } else if (creationData.direction === 'left') {
    angleOffset = Math.PI;  // 180 grados (izquierda)
  }

  const bulletAngle = creationData.rotation + angleOffset;
  const targetX = bullet.x + Math.cos(bulletAngle) * 10000;
  const targetY = bullet.y + Math.sin(bulletAngle) * 10000;

  console.log("BULLET: ", bullet);
  console.log("creationData: ", creationData);

  self.physics.moveTo(bullet, targetX, targetY, 750);

  function destroyBullet() {
    if (self.otherBullets.contains(bullet)) {
      bullet.destroy();
    }
  }
  setTimeout(destroyBullet, 1000);
}
