/**
 * Anchor System
 *
 * Manages anchor interaction and state.
 * Handles anchor proximity detection and toggle.
 * Follows Single Responsibility Principle.
 */

class AnchorSystem {
    constructor(scene) {
        this.scene = scene;
        this.anchorOffset = 115;
        this.interactionDistance = 15;
        this.indicator = null;
    }

    /**
     * Get anchor position in world coordinates
     * @param {Object} ship - Ship sprite
     * @returns {{x: number, y: number}}
     */
    getAnchorPosition(ship) {
        const angle = ship.rotation - Math.PI / 2;
        return {
            x: ship.x + Math.cos(angle) * this.anchorOffset,
            y: ship.y + Math.sin(angle) * this.anchorOffset
        };
    }

    /**
     * Check if player is near anchor
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @returns {boolean}
     */
    isNearAnchor(player, ship) {
        const anchorPos = this.getAnchorPosition(ship);
        const distance = Phaser.Math.Distance.Between(
            player.x, player.y,
            anchorPos.x, anchorPos.y
        );
        return distance < this.interactionDistance;
    }

    /**
     * Create or get anchor indicator
     * @returns {Object} Text object
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
     * Update anchor indicator
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     */
    updateIndicator(player, ship) {
        const indicator = this.getIndicator();
        const canUseAnchor = this.isNearAnchor(player, ship);

        if (canUseAnchor) {
            const anchorPos = this.getAnchorPosition(ship);
            const text = ship.isAnchored
                ? 'Presiona E para levantar ancla'
                : 'Presiona E para bajar ancla';

            indicator.setText(text);
            indicator.setPosition(anchorPos.x, anchorPos.y - 20);
            indicator.setVisible(true);
        } else {
            indicator.setVisible(false);
        }
    }

    /**
     * Toggle anchor state
     * @param {Object} ship - Ship sprite
     * @param {boolean} playSound - Should play sound
     */
    toggleAnchor(ship, playSound = true) {
        ship.isAnchored = !ship.isAnchored;

        if (playSound) {
            this.playAnchorSound(ship.isAnchored);
        }

        // Update target speed when raising anchor
        if (!ship.isAnchored && ship.body) {
            const currentSpeed = Math.sqrt(
                ship.body.velocity.x ** 2 +
                ship.body.velocity.y ** 2
            );
            ship.targetSpeed = currentSpeed;
        }

        // Emit anchor state to server
        if (this.scene.socket) {
            this.scene.socket.emit('anchorToggle', { isAnchored: ship.isAnchored });
        }

        return ship.isAnchored;
    }

    /**
     * Play anchor sound with fade out
     * @param {boolean} isAnchored - New anchor state
     */
    playAnchorSound(isAnchored) {
        const soundKey = isAnchored ? 'anchorDrop' : 'anchorRise';
        const sound = this.scene.sound.add(soundKey);
        sound.setVolume(0.2);
        sound.play();

        // Fade out after delay
        this.scene.time.delayedCall(2000, () => {
            this.scene.tweens.add({
                targets: sound,
                volume: 0,
                duration: 1400,
                onComplete: () => sound.stop()
            });
        });
    }

    /**
     * Update anchor system
     * @param {Object} player - Player sprite
     * @param {Object} ship - Ship sprite
     * @param {boolean} interactPressed - Was interact key pressed
     * @param {boolean} nearHelm - Is player near helm (to avoid conflicts)
     */
    update(player, ship, interactPressed, nearHelm = false) {
        this.updateIndicator(player, ship);

        // Only toggle if near anchor, not near helm, and interact pressed
        if (interactPressed && this.isNearAnchor(player, ship) && !nearHelm) {
            this.toggleAnchor(ship);
        }
    }
}
