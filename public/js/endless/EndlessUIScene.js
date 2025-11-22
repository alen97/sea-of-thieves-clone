/**
 * Endless UI Scene for Endless Sea of Rooms
 * HUD displaying hunger, thirst, health, and inventory
 */

class EndlessUIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'EndlessUIScene' });
    }

    create() {
        // Get reference to main scene
        this.mainScene = this.scene.get('EndlessScene');

        // Create UI elements
        this.createSurvivalBars();
        this.createInventoryDisplay();
        this.createBiomeIndicator();
        this.createWarningSystem();
        this.createMinimap();

        // Listen for events from main scene
        this.setupEventListeners();
    }

    createSurvivalBars() {
        const barWidth = 150;
        const barHeight = 16;
        const padding = 20;

        // Health bar
        this.healthBarBg = this.add.rectangle(padding, padding, barWidth, barHeight, 0x333333);
        this.healthBarBg.setOrigin(0, 0);
        this.healthBar = this.add.rectangle(padding, padding, barWidth, barHeight, 0xff0000);
        this.healthBar.setOrigin(0, 0);
        this.healthIcon = this.add.text(padding + barWidth + 5, padding, '❤', { fontSize: '14px' });

        // Hunger bar
        this.hungerBarBg = this.add.rectangle(padding, padding + 25, barWidth, barHeight, 0x333333);
        this.hungerBarBg.setOrigin(0, 0);
        this.hungerBar = this.add.rectangle(padding, padding + 25, barWidth, barHeight, 0xffa500);
        this.hungerBar.setOrigin(0, 0);
        this.hungerIcon = this.add.text(padding + barWidth + 5, padding + 25, '🍖', { fontSize: '14px' });

        // Thirst bar
        this.thirstBarBg = this.add.rectangle(padding, padding + 50, barWidth, barHeight, 0x333333);
        this.thirstBarBg.setOrigin(0, 0);
        this.thirstBar = this.add.rectangle(padding, padding + 50, barWidth, barHeight, 0x00bfff);
        this.thirstBar.setOrigin(0, 0);
        this.thirstIcon = this.add.text(padding + barWidth + 5, padding + 50, '💧', { fontSize: '14px' });

        // Labels
        this.healthLabel = this.add.text(padding + 5, padding + 1, '100', {
            fontSize: '12px',
            color: '#ffffff'
        });
        this.hungerLabel = this.add.text(padding + 5, padding + 26, '100', {
            fontSize: '12px',
            color: '#ffffff'
        });
        this.thirstLabel = this.add.text(padding + 5, padding + 51, '100', {
            fontSize: '12px',
            color: '#ffffff'
        });
    }

    createInventoryDisplay() {
        const startX = this.cameras.main.width - 180;
        const startY = 20;

        // Background panel
        this.inventoryPanel = this.add.rectangle(startX - 10, startY - 5, 170, 85, 0x000000, 0.5);
        this.inventoryPanel.setOrigin(0, 0);

        // Food display
        this.foodText = this.add.text(startX, startY, '🍖 Food: 0/30', {
            fontSize: '14px',
            color: '#ffffff'
        });

        // Water display
        this.waterText = this.add.text(startX, startY + 25, '💧 Water: 0/30', {
            fontSize: '14px',
            color: '#ffffff'
        });

        // Materials display
        this.materialsText = this.add.text(startX, startY + 50, '🔧 Materials: 0/100', {
            fontSize: '14px',
            color: '#ffffff'
        });
    }

    createBiomeIndicator() {
        this.biomeText = this.add.text(
            this.cameras.main.width / 2,
            20,
            'Calm Sea',
            {
                fontSize: '18px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.biomeText.setOrigin(0.5, 0);
    }

    createWarningSystem() {
        // Warning text (hidden by default)
        this.warningText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 100,
            '',
            {
                fontSize: '24px',
                color: '#ff0000',
                stroke: '#000000',
                strokeThickness: 4
            }
        );
        this.warningText.setOrigin(0.5);
        this.warningText.setVisible(false);

        // Hazard warning icon
        this.hazardWarning = this.add.text(
            this.cameras.main.width / 2,
            80,
            '⚠️ TORNADO NEARBY!',
            {
                fontSize: '20px',
                color: '#ffff00',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.hazardWarning.setOrigin(0.5);
        this.hazardWarning.setVisible(false);
    }

    createMinimap() {
        // Simple minimap in bottom-left corner
        const minimapSize = 120;
        const padding = 20;

        this.minimapBg = this.add.rectangle(
            padding,
            this.cameras.main.height - padding - minimapSize,
            minimapSize,
            minimapSize,
            0x000000,
            0.5
        );
        this.minimapBg.setOrigin(0, 0);

        // Minimap graphics for drawing
        this.minimapGraphics = this.add.graphics();
        this.minimapGraphics.setPosition(padding, this.cameras.main.height - padding - minimapSize);

        // Player dot
        this.minimapPlayer = this.add.circle(
            padding + minimapSize / 2,
            this.cameras.main.height - padding - minimapSize / 2,
            4,
            0x00ff00
        );
    }

    setupEventListeners() {
        if (!this.mainScene) return;

        // Survival updates
        this.mainScene.events.on('survivalUpdate', (stats) => {
            this.updateSurvivalBars(stats);
        });

        // Storage updates
        this.mainScene.events.on('storageChanged', (data) => {
            this.updateInventory(data);
        });

        // Biome changes
        this.mainScene.events.on('biomeChanged', (biome) => {
            this.updateBiome(biome);
        });

        // Warnings
        this.mainScene.events.on('survivalWarning', (data) => {
            this.showWarning(`Low ${data.type}!`);
        });

        this.mainScene.events.on('survivalCritical', (data) => {
            this.showWarning(`CRITICAL: ${data.type}!`, true);
        });

        this.mainScene.events.on('hazardNear', (data) => {
            this.showHazardWarning(data.distance);
        });

        // Fish caught notification
        this.mainScene.events.on('fishCaught', (item) => {
            this.showNotification(`Caught: ${item.name}`);
        });

        // Chest opened notification
        this.mainScene.events.on('chestOpened', (contents) => {
            this.showNotification('Chest opened!');
        });
    }

    updateSurvivalBars(stats) {
        const barWidth = 150;

        // Update health
        this.healthBar.width = (stats.health / 100) * barWidth;
        this.healthLabel.setText(Math.floor(stats.health).toString());

        // Update hunger
        this.hungerBar.width = (stats.hunger / 100) * barWidth;
        this.hungerLabel.setText(Math.floor(stats.hunger).toString());

        // Update thirst
        this.thirstBar.width = (stats.thirst / 100) * barWidth;
        this.thirstLabel.setText(Math.floor(stats.thirst).toString());

        // Color changes for low values
        this.healthBar.fillColor = stats.health < 30 ? 0xff0000 : 0x00ff00;
        this.hungerBar.fillColor = stats.hunger < 30 ? 0xff6600 : 0xffa500;
        this.thirstBar.fillColor = stats.thirst < 30 ? 0xff0000 : 0x00bfff;
    }

    updateInventory(data) {
        this.foodText.setText(`🍖 Food: ${Math.floor(data.food.current)}/${data.food.max}`);
        this.waterText.setText(`💧 Water: ${Math.floor(data.water.current)}/${data.water.max}`);
        this.materialsText.setText(`🔧 Materials: ${Math.floor(data.materials.current)}/${data.materials.max}`);
    }

    updateBiome(biome) {
        this.biomeText.setText(biome.name);

        // Flash effect
        this.tweens.add({
            targets: this.biomeText,
            alpha: 0.5,
            duration: 200,
            yoyo: true
        });
    }

    showWarning(message, critical = false) {
        this.warningText.setText(message);
        this.warningText.setColor(critical ? '#ff0000' : '#ffff00');
        this.warningText.setVisible(true);

        // Flash effect
        if (critical) {
            this.tweens.add({
                targets: this.warningText,
                alpha: 0,
                duration: 300,
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    this.warningText.setVisible(false);
                    this.warningText.setAlpha(1);
                }
            });
        } else {
            this.time.delayedCall(2000, () => {
                this.warningText.setVisible(false);
            });
        }
    }

    showHazardWarning(distance) {
        this.hazardWarning.setVisible(true);
        this.hazardWarning.setAlpha(Math.max(0.3, 1 - distance / 400));

        // Hide after a moment if not continuously updated
        this.time.delayedCall(500, () => {
            this.hazardWarning.setVisible(false);
        });
    }

    showNotification(message) {
        const notification = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height - 100,
            message,
            {
                fontSize: '16px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 2
            }
        );
        notification.setOrigin(0.5);

        this.tweens.add({
            targets: notification,
            y: notification.y - 50,
            alpha: 0,
            duration: 2000,
            onComplete: () => notification.destroy()
        });
    }

    updateMinimap(boatX, boatY, hazards, chests) {
        this.minimapGraphics.clear();

        const minimapSize = 120;
        const worldSize = 3200;
        const scale = minimapSize / worldSize;

        // Draw hazards as red dots
        this.minimapGraphics.fillStyle(0xff0000);
        for (const hazard of hazards) {
            this.minimapGraphics.fillCircle(
                hazard.x * scale,
                hazard.y * scale,
                3
            );
        }

        // Draw chests as yellow dots
        this.minimapGraphics.fillStyle(0xffff00);
        for (const chest of chests) {
            this.minimapGraphics.fillCircle(
                chest.x * scale,
                chest.y * scale,
                2
            );
        }

        // Update player position
        const padding = 20;
        this.minimapPlayer.x = padding + boatX * scale;
        this.minimapPlayer.y = this.cameras.main.height - padding - minimapSize + boatY * scale;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EndlessUIScene };
}
