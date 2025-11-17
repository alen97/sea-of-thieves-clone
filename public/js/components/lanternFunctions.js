// ========================================
// LANTERN FUNCTIONS
// ========================================

// Helper function to draw lantern graphics based on lit state
function drawLanternGraphics(graphics, isLit, hasAbyssLantern = false) {
  graphics.clear();

  if (isLit) {
    if (hasAbyssLantern) {
      // Violet/purple gradient when Abyss Lantern modifier is active
      // Outer circle (dark violet)
      graphics.fillStyle(0x4B0082, 0.4);
      graphics.fillCircle(0, 0, 12);

      // Middle circle
      graphics.fillStyle(0x6A00B8, 0.7);
      graphics.fillCircle(0, 0, 8);

      // Inner circle (brightest violet)
      graphics.fillStyle(0x7A00FF, 1.0);
      graphics.fillCircle(0, 0, 5);
    } else {
      // Three concentric circles (orange/yellow gradient) when lit normally
      // Outer circle (darkest orange)
      graphics.fillStyle(0xFF6600, 0.4);
      graphics.fillCircle(0, 0, 12);

      // Middle circle
      graphics.fillStyle(0xFF8800, 0.7);
      graphics.fillCircle(0, 0, 8);

      // Inner circle (brightest)
      graphics.fillStyle(0xFFAA00, 1.0);
      graphics.fillCircle(0, 0, 5);
    }
  } else {
    // Single gray circle when unlit
    graphics.fillStyle(0x666666, 0.8);
    graphics.fillCircle(0, 0, 8);
  }
}

// Helper function to add breathing animation to lantern
function addBreathingAnimation(scene, lanternContainer) {
  scene.tweens.add({
    targets: lanternContainer,
    scale: { from: 1.0, to: 1.15 },
    duration: 1000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
}

// Create the lantern visual
function createLantern(self, ship, isLit = false, hasAbyssLantern = false) {
  const lanternContainer = self.add.container(ship.x, ship.y);

  const graphics = self.add.graphics();

  // Store references for later updates
  lanternContainer.graphics = graphics;
  lanternContainer.scene = self;

  // Draw initial state
  drawLanternGraphics(graphics, isLit, hasAbyssLantern);

  lanternContainer.add(graphics);
  lanternContainer.setDepth(2.3); // Above ship, below cannons

  // Add breathing animation only if lit
  if (isLit) {
    addBreathingAnimation(self, lanternContainer);
  }

  return lanternContainer;
}

// Update lantern visual when lit state changes
function updateLanternVisual(lantern, isLit, hasAbyssLantern = false) {
  if (!lantern || !lantern.graphics) return;

  // Update graphics
  drawLanternGraphics(lantern.graphics, isLit, hasAbyssLantern);

  // Remove existing tweens (breathing animation)
  if (lantern.scene && lantern.scene.tweens) {
    lantern.scene.tweens.killTweensOf(lantern);
  }

  // Reset scale
  lantern.setScale(1.0);

  // Add breathing animation only if lit
  if (isLit && lantern.scene) {
    addBreathingAnimation(lantern.scene, lantern);
  }
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

  return distance < 15; // 15 pixels threshold
}
