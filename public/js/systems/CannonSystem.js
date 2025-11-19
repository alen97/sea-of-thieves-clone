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
     * Check if another player is using a specific cannon
     * @param {Object} otherPlayers - Phaser group of other players
     * @param {string} side - 'left' or 'right'
     * @returns {boolean}
     */
    isCannonOccupiedByOther(otherPlayers, side) {
        if (!otherPlayers) return false;

        const others = otherPlayers.getChildren();
        for (let i = 0; i < others.length; i++) {
            if (others[i].isOnCannon && others[i].cannonSide === side) {
                return true;
            }
        }
        return false;
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

        // Emit cannon state to server
        if (this.scene.socket) {
            this.scene.socket.emit('cannonToggle', {
                isOnCannon: true,
                cannonSide: cannon.side
            });
        }
    }

    /**
     * Dismount player from cannon
     * @param {Object} player - Player sprite
     */
    dismountCannon(player) {
        player.isOnCannon = false;
        player.cannonSide = null;
        player.canMove = true;

        // Emit cannon state to server
        if (this.scene.socket) {
            this.scene.socket.emit('cannonToggle', {
                isOnCannon: false,
                cannonSide: null
            });
        }
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
     * @param {Object} modifiers - Optional ship modifiers {fireRate: boolean}
     * @returns {boolean}
     */
    canShoot(side, currentTime, modifiers = null) {
        const lastShot = side === 'left' ? this.leftLastShot : this.rightLastShot;

        // Apply fire rate modifier with cap to prevent spam
        let effectiveCooldown = this.cooldownTime;
        if (modifiers && modifiers.fireRate) {
            const rawReduction = modifiers.fireRateBonus || 0.5;
            const reduction = Math.min(rawReduction, 0.90); // Cap at 90% reduction
            effectiveCooldown = this.cooldownTime * (1 - reduction);

            // Debug log
            console.log(`[CANNON] fireRateBonus: ${rawReduction}, capped: ${reduction}, cooldown: ${effectiveCooldown}ms`);
        }

        return (currentTime - lastShot) >= effectiveCooldown;
    }

    /**
     * Fire cannon
     * @param {Object} cannon - Cannon sprite
     * @param {Object} ship - Ship sprite
     * @param {Object} socket - Socket.io instance
     * @param {number} currentTime - Current time in ms
     * @param {Object} modifiers - Optional ship modifiers
     * @param {Array} collectedModifiers - Array of collected modifier types
     * @returns {boolean} Was fire successful
     */
    fireCannon(cannon, ship, socket, currentTime, modifiers = null, collectedModifiers = []) {
        if (!cannon || !ship) return false;
        if (!this.canShoot(cannon.side, currentTime, modifiers)) return false;

        // Update last shot time
        if (cannon.side === 'left') {
            this.leftLastShot = currentTime;
        } else {
            this.rightLastShot = currentTime;
        }

        // Create bullet data with modifiers
        let bulletSpeed = 750;
        let bulletColor = null;

        // DEBUG: Check collectedModifiers
        console.log('[FIRE DEBUG] collectedModifiers:', collectedModifiers);
        console.log('[FIRE DEBUG] Is array?', Array.isArray(collectedModifiers));
        console.log('[FIRE DEBUG] Length:', collectedModifiers?.length);
        console.log('[FIRE DEBUG] Has ENDLESS_BARRAGE?', collectedModifiers.includes('ENDLESS_BARRAGE'));

        // Endless Barrage modifier: +50% bullet speed + purple color
        // Only apply if specifically has ENDLESS_BARRAGE (not just any fireRate modifier)
        if (collectedModifiers.includes('ENDLESS_BARRAGE')) {
            console.log('[FIRE DEBUG] APPLYING ENDLESS BARRAGE - Speed: 1125, Color: 0x7A00FF');
            bulletSpeed = 750 * 1.5; // 1125 speed
            bulletColor = 0x7A00FF; // Violet/purple color
        } else {
            console.log('[FIRE DEBUG] NOT applying Endless Barrage - using normal bullet');
        }

        const bulletData = {
            x: cannon.x,
            y: cannon.y,
            rotation: cannon.rotation,
            velocityX: Math.cos(cannon.rotation) * bulletSpeed,
            velocityY: Math.sin(cannon.rotation) * bulletSpeed,
            shooterId: ship.playerId,
            color: bulletColor // Pass color for tinting
        };

        console.log('[FIRE DEBUG] bulletData being sent:', bulletData);
        console.log('[FIRE DEBUG] bulletSpeed:', bulletSpeed);
        console.log('[FIRE DEBUG] bulletColor:', bulletColor);

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
     * @param {Object} modifiers - Optional ship modifiers
     * @param {Object} otherPlayers - Phaser group of other players
     */
    updateIndicator(player, cannons, currentTime, nearHelm, nearAnchor, modifiers = null, otherPlayers = null) {
        const indicator = this.getIndicator();

        if (player.isOnCannon) {
            // Mounted: show cooldown if reloading
            const cannon = player.cannonSide === 'left' ? cannons.left : cannons.right;
            const canShoot = this.canShoot(player.cannonSide, currentTime, modifiers);

            if (!canShoot) {
                const lastShot = player.cannonSide === 'left' ? this.leftLastShot : this.rightLastShot;

                // Calculate effective cooldown with modifier (same logic as canShoot)
                let effectiveCooldown = this.cooldownTime;
                if (modifiers && modifiers.fireRate) {
                    const reduction = Math.min(modifiers.fireRateBonus || 0.5, 0.90); // Cap at 90%
                    effectiveCooldown = this.cooldownTime * (1 - reduction);
                }

                const timeRemaining = Math.ceil((effectiveCooldown - (currentTime - lastShot)) / 1000);
                indicator.setText(`Recargando... (${timeRemaining}s)`);
                indicator.setPosition(cannon.x, cannon.y - 30);
                indicator.setVisible(true);
            } else {
                indicator.setVisible(false);
            }
        } else {
            // Not mounted: show mount prompt if near cannon (and cannon not occupied)
            const nearLeft = this.isNearCannon(player, cannons.left);
            const nearRight = this.isNearCannon(player, cannons.right);
            const leftOccupied = this.isCannonOccupiedByOther(otherPlayers, 'left');
            const rightOccupied = this.isCannonOccupiedByOther(otherPlayers, 'right');

            if (nearLeft && !nearHelm && !nearAnchor && !leftOccupied) {
                indicator.setText('Presiona E para usar cañón');
                indicator.setPosition(cannons.left.x, cannons.left.y - 20);
                indicator.setVisible(true);
            } else if (nearRight && !nearHelm && !nearAnchor && !rightOccupied) {
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
     * @param {Object} otherPlayers - Phaser group of other players
     */
    handleInteraction(player, cannons, interactPressed, nearHelm, nearAnchor, otherPlayers) {
        if (!interactPressed) return;

        if (player.isOnCannon) {
            // Dismount
            this.dismountCannon(player);
        } else if (!nearHelm && !nearAnchor) {
            // Try to mount (only if cannon is not occupied by another player)
            if (this.isNearCannon(player, cannons.left) && !this.isCannonOccupiedByOther(otherPlayers, 'left')) {
                this.mountCannon(player, cannons.left);
            } else if (this.isNearCannon(player, cannons.right) && !this.isCannonOccupiedByOther(otherPlayers, 'right')) {
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
     * @param {Object} modifiers - Optional ship modifiers
     * @param {Object} otherPlayers - Phaser group of other players
     */
    update(player, ship, cannons, input, deltaTime, currentTime, nearHelm, nearAnchor, modifiers = null, otherPlayers = null, collectedModifiers = []) {
        // Update cannon positions
        this.updateCannonPosition(cannons.left, ship);
        this.updateCannonPosition(cannons.right, ship);

        // Update indicator
        this.updateIndicator(player, cannons, currentTime, nearHelm, nearAnchor, modifiers, otherPlayers);

        // Handle mount/dismount
        this.handleInteraction(player, cannons, input.interact, nearHelm, nearAnchor, otherPlayers);

        // Update cannon rotation if mounted
        if (player.isOnCannon) {
            const cannon = player.cannonSide === 'left' ? cannons.left : cannons.right;
            this.updateCannonRotation(cannon, input.steering, deltaTime);

            // Apply visual rotation change
            this.updateCannonPosition(cannon, ship);

            // Handle firing
            if (input.fire) {
                this.fireCannon(cannon, ship, this.scene.socket, currentTime, modifiers, collectedModifiers);
            }
        }
    }
}
