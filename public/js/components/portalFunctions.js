/**
 * Portal Functions
 *
 * Manages the visual portal that appears when player has Abyssal Compass
 */

/**
 * Create portal visual at specified room coordinates
 * @param {Object} scene - Phaser scene
 * @param {number} roomX - Room X coordinate
 * @param {number} roomY - Room Y coordinate
 * @returns {Object} Portal container with all visual elements
 */
function createPortal(scene, roomX, roomY) {
  const WORLD_WIDTH = 3200;
  const WORLD_HEIGHT = 3200;

  // Convert room coordinates to world coordinates (center of the room)
  const worldX = roomX * WORLD_WIDTH + (WORLD_WIDTH / 2);
  const worldY = roomY * WORLD_HEIGHT + (WORLD_HEIGHT / 2);

  // Create a container for all portal elements
  const portalContainer = scene.add.container(worldX, worldY);
  portalContainer.setDepth(2); // Below player (3) but above ocean

  // Outer circle - Violet glow (largest)
  const outerCircle = scene.add.circle(0, 0, 80, 0x7A00FF, 0.3);
  portalContainer.add(outerCircle);

  // Middle circle - Darker violet
  const middleCircle = scene.add.circle(0, 0, 55, 0x5500BB, 0.5);
  portalContainer.add(middleCircle);

  // Inner circle - Bright white center
  const innerCircle = scene.add.circle(0, 0, 30, 0xFFFFFF, 0.4);
  portalContainer.add(innerCircle);

  // Rotating squares for portal effect (like the map indicator)
  const square1 = scene.add.graphics();
  square1.fillStyle(0x7A00FF, 0.6);
  square1.fillRect(-40, -40, 80, 80);
  portalContainer.add(square1);

  const square2 = scene.add.graphics();
  square2.fillStyle(0x5500BB, 0.4);
  square2.fillRect(-30, -30, 60, 60);
  portalContainer.add(square2);

  // Store references for animations
  portalContainer.outerCircle = outerCircle;
  portalContainer.middleCircle = middleCircle;
  portalContainer.innerCircle = innerCircle;
  portalContainer.square1 = square1;
  portalContainer.square2 = square2;

  // Add pulsing animation to circles
  scene.tweens.add({
    targets: outerCircle,
    scaleX: 1.2,
    scaleY: 1.2,
    alpha: 0.15,
    duration: 2000,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1
  });

  scene.tweens.add({
    targets: middleCircle,
    scaleX: 1.15,
    scaleY: 1.15,
    alpha: 0.3,
    duration: 1800,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
    delay: 200
  });

  scene.tweens.add({
    targets: innerCircle,
    scaleX: 1.3,
    scaleY: 1.3,
    alpha: 0.2,
    duration: 1500,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
    delay: 400
  });

  // Add rotation animation to squares
  scene.tweens.add({
    targets: square1,
    rotation: Math.PI * 2,
    duration: 4000,
    ease: 'Linear',
    repeat: -1
  });

  scene.tweens.add({
    targets: square2,
    rotation: -Math.PI * 2,
    duration: 3000,
    ease: 'Linear',
    repeat: -1
  });

  // Initially hidden until player gets compass
  portalContainer.setVisible(false);

  return portalContainer;
}

/**
 * Update portal visibility based on compass modifier
 * @param {Object} portal - Portal container
 * @param {boolean} hasCompass - Whether player has Abyssal Compass
 */
function updatePortalVisibility(portal, hasCompass) {
  if (!portal) return;

  portal.setVisible(hasCompass);
}
