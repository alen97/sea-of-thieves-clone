// ========================================
// LANTERN FUNCTIONS
// ========================================

// Create the lantern visual (always visible, gradient circle)
function createLantern(self, ship) {
  const lanternContainer = self.add.container(ship.x, ship.y);

  const graphics = self.add.graphics();

  // Outer circle (darkest orange)
  graphics.fillStyle(0xFF6600, 0.4);
  graphics.fillCircle(0, 0, 12);

  // Middle circle
  graphics.fillStyle(0xFF8800, 0.7);
  graphics.fillCircle(0, 0, 8);

  // Inner circle (brightest)
  graphics.fillStyle(0xFFAA00, 1.0);
  graphics.fillCircle(0, 0, 5);

  lanternContainer.add(graphics);
  lanternContainer.setDepth(2.3); // Above ship, below cannons

  // Breathing effect - gentle pulsing animation
  self.tweens.add({
    targets: lanternContainer,
    scale: { from: 1.0, to: 1.15 },
    duration: 1000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });

  return lanternContainer;
}

// Note: Light effect is now handled by the bitmap mask system in UIScene
// The lantern visual remains as a reference point for where light emanates

// Update lantern position to follow ship
function updateLanternPosition(lantern, ship) {
  if (lantern && ship) {
    lantern.setPosition(ship.x, ship.y);
    lantern.setRotation(ship.rotation);
  }
}

// Check if player is near the lantern (center of ship)
function isNearLantern(player, ship) {
  if (!player || !ship) return false;

  const distance = Phaser.Math.Distance.Between(
    player.x,
    player.y,
    ship.x,
    ship.y
  );

  return distance < 35; // 35 pixels threshold
}
