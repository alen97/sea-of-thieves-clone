/**
 * Cannon System
 *
 * Manages cannon interaction, aiming, and firing.
 * Handles cannon mounting/dismounting and cooldown.
 * Follows Single Responsibility Principle.
 */

class CannonSystem {
    constructor(scene) {
        this.scene = scene;
        this.cannonOffset = 75;
        this.interactionDistance = 30;
        this.rotationSpeed = 0.5; // radians per second
        this.maxAngle = Math.PI / 3; // ±60 degrees
        this.cooldownTime = 3000; // 3 seconds
        this.indicator = null;

        // Cooldown tracking
        this.leftLastShot = 0;
        this.rightLastShot = 0;
    }

    /**
     * Create cannons for ship
     * @param {Object} ship - Ship sprite
     * @returns {Object} Cannons {left, right}
     */
    createCannons(ship) {
        const cannons = {
            left: this.createCannon('left'),
            right: this.createCannon('right')
        };

        return cannons;
    }

    /**
     * Create a single cannon sprite
     * @param {string} side - 'left' or 'right'
     * @returns {Object} Cannon sprite
     */
    createCannon(side) {
        const cannon = this.scene.add.sprite(0, 0, 'cannon')
            .setOrigin(0.5, 0.5)
            .setDisplaySize(78, 30)
            .setDepth(2.5);

        cannon.relativeAngle = 0;
        cannon.side = side;

        return cannon;
    }

    /**
     * Update cannon position based on ship
     * @param {Object} cannon - Cannon sprite
     * @param {Object} ship - Ship sprite
     */
    updateCannonPosition(cannon, ship) {
        if (!cannon || !ship) return;

        const shipAngle = ship.rotation - Math.PI / 2;

        if (cannon.side === 'left') {
            // Left cannon (perpendicular left of ship)
            cannon.x = ship.x + Math.cos(shipAngle - Math.PI / 2) * this.cannonOffset;
            cannon.y = ship.y + Math.sin(shipAngle - Math.PI / 2) * this.cannonOffset;
            cannon.rotation = ship.rotation + Math.PI + cannon.relativeAngle;
        } else if (cannon.side === 'right') {
            // Right cannon (perpendicular right of ship)
            cannon.x = ship.x + Math.cos(shipAngle + Math.PI / 2) * this.cannonOffset;
            cannon.y = ship.y + Math.sin(shipAngle + Math.PI / 2) * this.cannonOffset;
            cannon.rotation = ship.rotation + cannon.relativeAngle;
        }
    }

    /**
     * Check if player is near cannon
     * @param {Object} player - Player sprite
     * @param {Object} cannon - Cannon sprite
     * @returns {boolean}
     */
    isNearCannon(player, cannon) {
        if (!player || !cannon) return false;

        const distance = Phaser.Math.Distance.Between(
            player.x, player.y,
            cannon.x, cannon.y
        );

        return distance < this.interactionDistance;
    }

    /**
     * Mount player on cannon
     * @param {Object} player - Player sprite
     * @param {Object} cannon - Cannon sprite
     */
    mountCannon(player, cannon) {
        player.isOnCannon = true;
        player.cannonSide = cannon.side;
        player.canMove = false;
    }

    /**
     * Dismount player from cannon
     * @param {Object} player - Player sprite
     */
    dismountCannon(player) {
        player.isOnCannon = false;
        player.cannonSide = null;
        player.canMove = true;
    }

    /**
     * Update cannon rotation based on input
     * @param {Object} cannon - Cannon sprite
     * @param {Object} aimInput - {left: boolean, right: boolean}
     * @param {number} deltaTime - Delta time in seconds
     */
    updateCannonRotation(cannon, aimInput, deltaTime) {
        if (!cannon) return;

        const rotationChange = this.rotationSpeed * deltaTime;

        if (aimInput.left) {
            cannon.relativeAngle -= rotationChange;
        } else if (aimInput.right) {
            cannon.relativeAngle += rotationChange;
        }

        // Clamp angle
        cannon.relativeAngle = Phaser.Math.Clamp(
            cannon.relativeAngle,
            -this.maxAngle,
            this.maxAngle
        );
    }

    /**
     * Check if cannon can shoot
     * @param {string} side - 'left' or 'right'
     * @param {number} currentTime - Current time in ms
     * @returns {boolean}
     */
    canShoot(side, currentTime) {
        const lastShot = side === 'left' ? this.leftLastShot : this.rightLastShot;
        return (currentTime - lastShot) >= this.cooldownTime;
    }

    /**
     * Fire cannon
     * @param {Object} cannon - Cannon sprite
     * @param {Object} ship - Ship sprite
     * @param {Object} socket - Socket.io instance
     * @param {number} currentTime - Current time in ms
     * @returns {boolean} Was fire successful
     */
    fireCannon(cannon, ship, socket, currentTime) {
        if (!cannon || !ship) return false;
        if (!this.canShoot(cannon.side, currentTime)) return false;

        // Update last shot time
        if (cannon.side === 'left') {
            this.leftLastShot = currentTime;
        } else {
            this.rightLastShot = currentTime;
        }

        // Create bullet data
        const bulletData = {
            x: cannon.x,
            y: cannon.y,
            rotation: cannon.rotation,
            velocityX: Math.cos(cannon.rotation) * 750,
            velocityY: Math.sin(cannon.rotation) * 750,
            shooterId: ship.playerId
        };

        // Emit to server
        socket.emit('createBullet', bulletData);

        // Camera shake effect
        this.scene.cameras.main.shake(100, 0.003);

        return true;
    }

    /**
     * Get or create cannon indicator
     * @returns {Object} Text sprite
     */
    getIndicator() {
        if (!this.indicator) {
            this.indicator = this.scene.add.text(0, 0, '', {
                fontSize: '12px',
                fill: '#ffffff',
                backgroundColor: '#000000',
                padding: { x: 5, y: 3 }
            }).setDepth(10).setOrigin(0.5);
        }
        return this.indicator;
    }

    /**
     * Update cannon indicator
     * @param {Object} player - Player sprite
     * @param {Object} cannons - {left, right}
     * @param {number} currentTime - Current time in ms
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearAnchor - Is player near anchor
     */
    updateIndicator(player, cannons, currentTime, nearHelm, nearAnchor) {
        const indicator = this.getIndicator();

        if (player.isOnCannon) {
            // Mounted: show cooldown if reloading
            const cannon = player.cannonSide === 'left' ? cannons.left : cannons.right;
            const canShoot = this.canShoot(player.cannonSide, currentTime);

            if (!canShoot) {
                const lastShot = player.cannonSide === 'left' ? this.leftLastShot : this.rightLastShot;
                const timeRemaining = Math.ceil((this.cooldownTime - (currentTime - lastShot)) / 1000);
                indicator.setText(`Recargando... (${timeRemaining}s)`);
                indicator.setPosition(cannon.x, cannon.y - 30);
                indicator.setVisible(true);
            } else {
                indicator.setVisible(false);
            }
        } else {
            // Not mounted: show mount prompt if near cannon
            const nearLeft = this.isNearCannon(player, cannons.left);
            const nearRight = this.isNearCannon(player, cannons.right);

            if (nearLeft && !nearHelm && !nearAnchor) {
                indicator.setText('Presiona E para usar cañón');
                indicator.setPosition(cannons.left.x, cannons.left.y - 20);
                indicator.setVisible(true);
            } else if (nearRight && !nearHelm && !nearAnchor) {
                indicator.setText('Presiona E para usar cañón');
                indicator.setPosition(cannons.right.x, cannons.right.y - 20);
                indicator.setVisible(true);
            } else {
                indicator.setVisible(false);
            }
        }
    }

    /**
     * Handle cannon interaction
     * @param {Object} player - Player sprite
     * @param {Object} cannons - {left, right}
     * @param {boolean} interactPressed - Was interact pressed
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearAnchor - Is player near anchor
     */
    handleInteraction(player, cannons, interactPressed, nearHelm, nearAnchor) {
        if (!interactPressed) return;

        if (player.isOnCannon) {
            // Dismount
            this.dismountCannon(player);
        } else if (!nearHelm && !nearAnchor) {
            // Try to mount
            if (this.isNearCannon(player, cannons.left)) {
                this.mountCannon(player, cannons.left);
            } else if (this.isNearCannon(player, cannons.right)) {
                this.mountCannon(player, cannons.right);
            }
        }
    }

    /**
     * Update cannon system
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {Object} cannons - {left, right}
     * @param {Object} input - Input state
     * @param {number} deltaTime - Delta time in seconds
     * @param {number} currentTime - Current time in ms
     * @param {boolean} nearHelm - Is player near helm
     * @param {boolean} nearAnchor - Is player near anchor
     */
    update(player, ship, cannons, input, deltaTime, currentTime, nearHelm, nearAnchor) {
        // Update cannon positions
        this.updateCannonPosition(cannons.left, ship);
        this.updateCannonPosition(cannons.right, ship);

        // Update indicator
        this.updateIndicator(player, cannons, currentTime, nearHelm, nearAnchor);

        // Handle mount/dismount
        this.handleInteraction(player, cannons, input.interact, nearHelm, nearAnchor);

        // Update cannon rotation if mounted
        if (player.isOnCannon) {
            const cannon = player.cannonSide === 'left' ? cannons.left : cannons.right;
            this.updateCannonRotation(cannon, input.aim, deltaTime);

            // Apply visual rotation change
            this.updateCannonPosition(cannon, ship);

            // Handle firing
            if (input.fire) {
                this.fireCannon(cannon, ship, this.scene.socket, currentTime);
            }
        }
    }
}
