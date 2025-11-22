/**
 * Endless Scene - Main game scene for Endless Sea of Rooms
 * Integrates all systems for the exploration/survival mode
 */

// World configuration
const ENDLESS_WORLD_WIDTH = 3200;
const ENDLESS_WORLD_HEIGHT = 3200;

class EndlessScene extends Phaser.Scene {
    constructor() {
        super({ key: 'EndlessScene' });

        // Current room position
        this.roomX = 0;
        this.roomY = 0;
    }

    preload() {
        // Load endless mode specific assets
        // Note: Many assets will use placeholders - replace with actual art

        // Boat
        this.load.image('small_boat', 'assets/ship.png'); // Placeholder
        this.load.image('fishing_rod', 'assets/fishing_rod.png');
        this.load.image('hook', 'assets/hook.png');

        // Items
        this.load.image('fish_common', 'assets/items/fish.png');
        this.load.image('fish_medium', 'assets/items/fish.png');
        this.load.image('fish_rare', 'assets/items/fish.png');
        this.load.image('fish_legendary', 'assets/items/fish.png');
        this.load.image('fish_cooked', 'assets/items/fish.png');
        this.load.image('water_dirty', 'assets/items/water.png');
        this.load.image('water_clean', 'assets/items/water.png');
        this.load.image('boot', 'assets/items/boot.png');
        this.load.image('bottle', 'assets/items/bottle.png');
        this.load.image('wood', 'assets/items/wood.png');
        this.load.image('cloth', 'assets/items/cloth.png');
        this.load.image('metal', 'assets/items/metal.png');

        // Environment
        this.load.image('chest', 'assets/chest.png');
        this.load.image('tornado', 'assets/tornado.png');
        this.load.image('storage_box', 'assets/storage_box.png');
        this.load.image('cooking_station', 'assets/cooking_station.png');
        this.load.image('fire', 'assets/fire.png');

        // Particles
        this.load.image('wake_particle', 'assets/particles/wake.png');
        this.load.image('wind_particle', 'assets/particles/wind.png');

        // Ocean tile
        this.load.image('ocean', 'assets/ocean.png');

        // Audio
        this.load.audio('pickup', 'sounds/pickup.wav');
        this.load.audio('deposit', 'sounds/deposit.wav');
        this.load.audio('catch', 'sounds/catch.wav');
        this.load.audio('eat', 'sounds/eat.wav');
        this.load.audio('drink', 'sounds/drink.wav');
        this.load.audio('cooking', 'sounds/cooking.wav');
        this.load.audio('cooking_done', 'sounds/cooking_done.wav');
        this.load.audio('purifying', 'sounds/purifying.wav');
        this.load.audio('purify_done', 'sounds/purify_done.wav');
        this.load.audio('hook_deploy', 'sounds/hook_deploy.wav');
        this.load.audio('hook_retract', 'sounds/hook_retract.wav');
        this.load.audio('chest_catch', 'sounds/chest_catch.wav');
        this.load.audio('chest_open', 'sounds/chest_open.wav');
        this.load.audio('tornado_spawn', 'sounds/tornado_spawn.wav');
        this.load.audio('tornado_death', 'sounds/tornado_death.wav');
    }

    create() {
        // Create ocean background
        this.ocean = this.add.tileSprite(
            ENDLESS_WORLD_WIDTH / 2,
            ENDLESS_WORLD_HEIGHT / 2,
            ENDLESS_WORLD_WIDTH,
            ENDLESS_WORLD_HEIGHT,
            'ocean'
        );

        // Set world bounds
        this.physics.world.setBounds(0, 0, ENDLESS_WORLD_WIDTH, ENDLESS_WORLD_HEIGHT);

        // Initialize systems
        this.initializeSystems();

        // Create boat
        this.createBoat();

        // Setup input
        this.setupInput();

        // Setup camera
        this.cameras.main.setBounds(0, 0, ENDLESS_WORLD_WIDTH, ENDLESS_WORLD_HEIGHT);
        this.cameras.main.startFollow(this.boat.sprite, true, 0.1, 0.1);

        // Start UI scene
        this.scene.launch('EndlessUIScene');
        this.uiScene = this.scene.get('EndlessUIScene');

        // Initial biome
        this.biomeSystem.onRoomTransition(this.roomX, this.roomY);

        // Initial spawns
        this.spawnInitialContent();

        // Emit initial states
        this.survivalSystem.scene.events.emit('survivalUpdate', this.survivalSystem.getStats());
        this.storageSystem.onStorageChanged();

        console.log('Endless Sea of Rooms started!');
    }

    initializeSystems() {
        // Core systems
        this.biomeSystem = new BiomeSystem(this);
        this.survivalSystem = new SurvivalSystem(this);
        this.storageSystem = new StorageBoxSystem(this);
        this.playerInventory = new PlayerInventorySystem(this);
        this.fishingSystem = new FishingSystem(this);
        this.hookSystem = new HookSystem(this);
        this.cookingSystem = new CookingSystem(this);
        this.hazardSystem = new HazardSystem(this);
        this.chestSystem = new ChestSystem(this);

        // Setup event listeners
        this.setupSystemEvents();
    }

    createBoat() {
        // Create small boat at center of room
        this.boat = createSmallBoat(
            this,
            ENDLESS_WORLD_WIDTH / 2,
            ENDLESS_WORLD_HEIGHT / 2
        );

        // Initialize systems that need boat reference
        this.fishingSystem.createRods(this.boat);
        this.hookSystem.init(this.boat);

        // Create storage and cooking on boat
        const storagePos = getEquipmentPosition(this.boat, 'storage');
        this.storageSystem.createSprite(storagePos.x, storagePos.y);

        const cookingPos = getEquipmentPosition(this.boat, 'cooking');
        this.cookingSystem.createStation(cookingPos.x, cookingPos.y);

        // Player starts on boat
        this.playerInventory.init(this.boat.sprite);
    }

    setupInput() {
        // Keyboard input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys({
            A: Phaser.Input.Keyboard.KeyCodes.A,
            D: Phaser.Input.Keyboard.KeyCodes.D,
            W: Phaser.Input.Keyboard.KeyCodes.W,
            S: Phaser.Input.Keyboard.KeyCodes.S,
            E: Phaser.Input.Keyboard.KeyCodes.E,
            F: Phaser.Input.Keyboard.KeyCodes.F,
            SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE
        });

        // Action key handlers
        this.input.keyboard.on('keydown-SPACE', () => this.toggleAnchor());
        this.input.keyboard.on('keydown-E', () => this.interact());
        this.input.keyboard.on('keydown-F', () => this.deployHook());
    }

    setupSystemEvents() {
        // Player death
        this.events.on('playerDeath', (data) => {
            this.handlePlayerDeath(data);
        });

        // Chest caught by hook
        this.events.on('chestCaught', (chest) => {
            // Auto-open chest and add to storage
            this.chestSystem.openChest(chest, this.storageSystem);
        });

        // Fish caught
        this.events.on('fishCaught', (item) => {
            // Auto-pickup fish
            if (!this.playerInventory.isHoldingItem()) {
                this.playerInventory.pickupItem(item);
            }
        });
    }

    spawnInitialContent() {
        // Spawn some chests
        for (let i = 0; i < 2; i++) {
            const x = 500 + Math.random() * 2200;
            const y = 500 + Math.random() * 2200;
            this.chestSystem.spawnChest(x, y);
        }
    }

    update(time, delta) {
        const deltaTime = delta / 1000; // Convert to seconds

        // Update boat physics
        this.updateBoatMovement(deltaTime);

        // Update all systems
        this.survivalSystem.update(deltaTime);
        this.fishingSystem.update(time, deltaTime);
        this.hookSystem.update(time, deltaTime);
        this.cookingSystem.update();
        this.hazardSystem.update(time, deltaTime, this.boat);
        this.chestSystem.update(time, deltaTime);

        // Check hook collisions
        this.hookSystem.checkChestCollision(this.chestSystem.getActiveChests());

        // Update equipment positions on boat
        this.updateBoatEquipment();

        // Check room transitions
        this.checkRoomTransition();

        // Try to spawn hazards and chests
        const spawnChances = this.biomeSystem.getSpawnChances();
        this.hazardSystem.trySpawnHazard(time, spawnChances.hazard * 0.1, this.roomX, this.roomY);
        this.chestSystem.trySpawnChest(time, spawnChances.chest * 0.1);

        // Update minimap
        if (this.uiScene && this.uiScene.updateMinimap) {
            this.uiScene.updateMinimap(
                this.boat.state.x,
                this.boat.state.y,
                this.hazardSystem.getHazardPositions(),
                this.chestSystem.getActiveChests()
            );
        }

        // Scroll ocean
        this.ocean.tilePositionX += this.boat.state.velocityX * deltaTime * 0.5;
        this.ocean.tilePositionY += this.boat.state.velocityY * deltaTime * 0.5;

        // Update player inventory sprite position
        this.playerInventory.update();
    }

    updateBoatMovement(deltaTime) {
        // Get input
        const input = {
            turnLeft: this.keys.A.isDown || this.cursors.left.isDown,
            turnRight: this.keys.D.isDown || this.cursors.right.isDown
        };

        // Update physics
        this.boat.state = updateSmallBoatPhysics(this.boat.state, input, deltaTime);

        // Apply to sprite
        applyBoatState(this.boat);
    }

    updateBoatEquipment() {
        // Update storage position
        const storagePos = getEquipmentPosition(this.boat, 'storage');
        this.storageSystem.updatePosition(storagePos.x, storagePos.y);

        // Update cooking position
        const cookingPos = getEquipmentPosition(this.boat, 'cooking');
        this.cookingSystem.updatePosition(cookingPos.x, cookingPos.y, this.boat.state.rotation);
    }

    toggleAnchor() {
        this.boat.state.isAnchored = !this.boat.state.isAnchored;

        // Visual/audio feedback
        if (this.boat.state.isAnchored) {
            this.events.emit('anchorDropped');
        } else {
            this.events.emit('anchorRaised');
        }
    }

    interact() {
        // Check what we can interact with

        // 1. If holding item and near storage, deposit
        if (this.playerInventory.isHoldingItem()) {
            if (this.storageSystem.isPlayerNear(this.boat.sprite, 100)) {
                this.playerInventory.depositToStorage(this.storageSystem);
                return;
            }
        }

        // 2. If near storage and have raw fish, cook
        if (this.storageSystem.getAmount('food') > 0) {
            if (this.cookingSystem.isPlayerNear(this.boat.sprite, 100)) {
                // Get raw fish from storage
                const rawFish = {
                    ...ITEM_TYPES.FISH_COMMON,
                    needsCooking: true
                };
                if (this.storageSystem.consume('food', 1)) {
                    this.cookingSystem.startCooking(rawFish, this.storageSystem);
                }
                return;
            }
        }

        // 3. Eat food if hungry
        if (this.survivalSystem.hunger < 80 && this.storageSystem.getAmount('food') > 0) {
            if (this.storageSystem.consume('food', 1)) {
                this.survivalSystem.eat({ nutrition: 20 });
            }
            return;
        }

        // 4. Drink water if thirsty
        if (this.survivalSystem.thirst < 80 && this.storageSystem.getAmount('water') > 0) {
            if (this.storageSystem.consume('water', 1)) {
                this.survivalSystem.drink({ hydration: 25 });
            }
            return;
        }

        // 5. Collect pending fish
        if (this.fishingSystem.hasPendingCatch()) {
            this.fishingSystem.collectCatch(this.playerInventory);
            return;
        }
    }

    deployHook() {
        if (this.hookSystem.canDeploy()) {
            this.hookSystem.deploy();
        }
    }

    checkRoomTransition() {
        const x = this.boat.state.x;
        const y = this.boat.state.y;

        let newRoomX = this.roomX;
        let newRoomY = this.roomY;
        let transitioned = false;

        // Check boundaries
        if (x < 100) {
            newRoomX--;
            this.boat.state.x = ENDLESS_WORLD_WIDTH - 200;
            transitioned = true;
        } else if (x > ENDLESS_WORLD_WIDTH - 100) {
            newRoomX++;
            this.boat.state.x = 200;
            transitioned = true;
        }

        if (y < 100) {
            newRoomY--;
            this.boat.state.y = ENDLESS_WORLD_HEIGHT - 200;
            transitioned = true;
        } else if (y > ENDLESS_WORLD_HEIGHT - 100) {
            newRoomY++;
            this.boat.state.y = 200;
            transitioned = true;
        }

        if (transitioned) {
            this.roomX = newRoomX;
            this.roomY = newRoomY;

            // Apply new position
            applyBoatState(this.boat);

            // Clear old content
            this.hazardSystem.clearAll();
            this.chestSystem.clearAll();

            // Update biome
            this.biomeSystem.onRoomTransition(newRoomX, newRoomY);

            // Spawn new content
            this.spawnInitialContent();

            // Emit transition event
            this.events.emit('roomTransition', { x: newRoomX, y: newRoomY });

            console.log(`Entered room (${newRoomX}, ${newRoomY})`);
        }
    }

    handlePlayerDeath(data) {
        console.log('Player died:', data.cause);

        // Stop the game
        this.scene.pause();

        // Show death screen
        const deathScreen = document.getElementById('deathScreen');
        if (deathScreen) {
            const deathMessage = document.getElementById('deathMessage');
            if (deathMessage) {
                deathMessage.textContent = `You died from ${data.cause}!`;
            }
            deathScreen.style.display = 'flex';
        }
    }

    // Called when restarting
    restart() {
        // Reset survival
        this.survivalSystem.reset();

        // Clear hazards and chests
        this.hazardSystem.clearAll();
        this.chestSystem.clearAll();

        // Reset boat position
        this.boat.state.x = ENDLESS_WORLD_WIDTH / 2;
        this.boat.state.y = ENDLESS_WORLD_HEIGHT / 2;
        this.boat.state.rotation = 0;
        this.boat.state.isAnchored = true;
        applyBoatState(this.boat);

        // Reset room
        this.roomX = 0;
        this.roomY = 0;
        this.biomeSystem.onRoomTransition(0, 0);

        // Spawn content
        this.spawnInitialContent();

        // Resume
        this.scene.resume();
    }

    shutdown() {
        // Clean up all systems
        this.biomeSystem.destroy();
        this.storageSystem.destroy();
        this.fishingSystem.destroy();
        this.hookSystem.destroy();
        this.cookingSystem.destroy();
        this.hazardSystem.destroy();
        this.chestSystem.destroy();
        this.playerInventory.destroy();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EndlessScene };
}
