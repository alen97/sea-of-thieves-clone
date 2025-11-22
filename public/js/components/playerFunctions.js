////////////////////////////////////////////////// PLAYER FUNCTIONS

function addPlayer(self, playerInfo, ship, playerColor = 'default') {
    // Determinar el sprite y animación basado en el color
    const spriteKey = 'player' + playerColor.charAt(0).toUpperCase() + playerColor.slice(1);
    const animKey = 'run' + playerColor.charAt(0).toUpperCase() + playerColor.slice(1);

    // Crear el jugador con sprite de animación
    const player = self.physics.add.sprite(
        ship.x + playerInfo.x,
        ship.y + playerInfo.y,
        spriteKey,
        0 // First frame
    )
        .setOrigin(0.5, 0.5)
        .setDisplaySize(28, 28);

    player.setDepth(3);
    player.isControllingShip = false;
    player.isFishing = false; // Para sistema de pesca
    player.fishingSide = null; // 'left' o 'right'
    player.isInCrowsNest = false; // Para sistema de cofa
    player.isRepairing = false; // Para sistema de reparación
    player.canMove = true; // Control de movimiento
    player.heldItem = null; // Item en mano ('fish', etc.)
    player.heldItemSprite = null; // Sprite del item en mano
    player.ship = ship; // Referencia al barco
    player.playerColor = playerColor; // Store color for animation
    player.animKey = animKey; // Store animation key

    // Coordenadas locales persistentes (relativas al barco)
    player.localX = playerInfo.x;
    player.localY = playerInfo.y;

    // Rotación local persistente (relativa al barco)
    player.lastRotation = Math.PI;

    // Jugador apunta inicialmente hacia arriba
    player.setRotation(Math.PI);

    // La cámara inicialmente sigue al jugador
    self.cameras.main.startFollow(player, 1, 1);

    return player;
}

function addOtherPlayer(self, playerInfo, ship, playerColor = 'default') {
    // Determinar el sprite y animación basado en el color
    const spriteKey = 'player' + playerColor.charAt(0).toUpperCase() + playerColor.slice(1);
    const animKey = 'run' + playerColor.charAt(0).toUpperCase() + playerColor.slice(1);

    // Crear jugador de otro con sprite de animación
    const player = self.add.sprite(
        ship.x + playerInfo.x,
        ship.y + playerInfo.y,
        spriteKey,
        0 // First frame
    )
        .setOrigin(0.5, 0.5)
        .setDisplaySize(28, 28);

    player.setDepth(3);
    player.playerColor = playerColor; // Store color for animation
    player.animKey = animKey; // Store animation key

    return player;
}

function updatePlayer(self, player, ship, input, deltaTime, inputEnabled = true) {
    const playerSpeed = 100;

    if (!player.isControllingShip && !player.isFishing && !player.isInCrowsNest) {
        // El jugador NO está en el timón, ni pescando, ni en la cofa - puede caminar

        // Player below crow's nest when walking
        player.setDepth(3);

        // Usar coordenadas locales persistentes (NO recalcular desde world position)
        let localX = player.localX;
        let localY = player.localY;

        // Variables para animación y rotación
        let isMoving = false;
        let playerRotation = player.rotation;

        // Solo procesar input WASD si inputEnabled = true y no está reparando
        if (inputEnabled && !player.isRepairing) {
            // Aplicar movimiento en coordenadas DEL MUNDO (absolutas)
            let worldVelX = 0;
            let worldVelY = 0;

            if (input.keyW.isDown) worldVelY -= playerSpeed; // NORTE (absoluto)
            if (input.keyS.isDown) worldVelY += playerSpeed; // SUR (absoluto)
            if (input.keyA.isDown) worldVelX -= playerSpeed; // OESTE (absoluto)
            if (input.keyD.isDown) worldVelX += playerSpeed; // ESTE (absoluto)

            // Normalizar velocidad diagonal
            if (worldVelX !== 0 && worldVelY !== 0) {
                worldVelX *= 0.707;
                worldVelY *= 0.707;
            }

            // Convertir velocidad del mundo a velocidad LOCAL
            const cosAngle = Math.cos(-ship.rotation);
            const sinAngle = Math.sin(-ship.rotation);
            const localVelX = worldVelX * cosAngle - worldVelY * sinAngle;
            const localVelY = worldVelX * sinAngle + worldVelY * cosAngle;

            // Aplicar movimiento directamente a coordenadas locales PERSISTENTES
            localX += localVelX * deltaTime;
            localY += localVelY * deltaTime;

            // Determinar si está en movimiento
            isMoving = (worldVelX !== 0 || worldVelY !== 0);

            // Rotar jugador según dirección del input (en coordenadas ABSOLUTAS del mundo)
            if (isMoving) {
                const directionAngles = {
                    "W":  Math.PI,                  // NORTE (absoluto)
                    "S":  0,                        // SUR (absoluto)
                    "A":  Math.PI / 2,              // OESTE (absoluto)
                    "D": -Math.PI / 2,              // ESTE (absoluto)
                    "WA": (3 * Math.PI) / 4,        // Noroeste
                    "WD": -(3 * Math.PI) / 4,       // Noreste
                    "SA": Math.PI / 4,              // Suroeste
                    "SD": -Math.PI / 4              // Sureste
                };

                let combo = "";
                if (input.keyW.isDown) combo += "W";
                if (input.keyS.isDown) combo += "S";
                if (input.keyA.isDown) combo += "A";
                if (input.keyD.isDown) combo += "D";

                const angle = directionAngles[combo];
                if (angle !== undefined) {
                    playerRotation = angle;
                }
            }
        }

        // Clamping: Mantener jugador dentro de los límites del barco
        const shipBoundsWidth = 178 - 45;
        const shipBoundsHeight = 463 - 200;
        const maxX = shipBoundsWidth / 2 - 12;
        const maxY = shipBoundsHeight / 2 - 7.5;

        localX = Phaser.Math.Clamp(localX, -maxX, maxX);
        localY = Phaser.Math.Clamp(localY, -maxY, maxY);

        // Guardar coordenadas locales actualizadas (persistentes)
        player.localX = localX;
        player.localY = localY;

        // Convertir coordenadas locales de vuelta a coordenadas del mundo
        const cosAngleBack = Math.cos(ship.rotation);
        const sinAngleBack = Math.sin(ship.rotation);
        const worldX = localX * cosAngleBack - localY * sinAngleBack;
        const worldY = localX * sinAngleBack + localY * cosAngleBack;

        // Posicionar jugador ABSOLUTAMENTE (sin velocity propia)
        player.setPosition(ship.x + worldX, ship.y + worldY);
        player.setVelocity(0, 0); // Eliminar velocity propia (pegado al barco)

         // Ajustar rotación del jugador cuando el barco rota (solo si no está en movimiento)
        if (ship.previousRotation !== undefined && !isMoving) {
            const rotationDelta = ship.rotation - ship.previousRotation;
            if (Math.abs(rotationDelta) > 0.001) {  // Umbral para evitar micro-ajustes
                player.lastRotation += rotationDelta;
            }
        }

        // Rotación del sprite siempre en coordenadas absolutas del mundo
        // Mantiene la dirección en la que el jugador estaba caminando
        if (isMoving) {
            player.lastRotation = playerRotation;
        }
        // Aplicar rotación absoluta (sin agregar ship.rotation)
        player.setRotation(player.lastRotation);

        // Manejar animación
        if (isMoving) {
            if (!player.anims.isPlaying || player.anims.currentAnim.key !== player.animKey) {
                player.play(player.animKey);
            }
        } else {
            if (player.anims.isPlaying) {
                player.stop();
                player.setFrame(0); // First frame
            }
        }

    } else if (player.isInCrowsNest) {
        // El jugador ESTÁ en la cofa - puede rotar y la cámara se desliza

        // Player on top of crow's nest
        player.setDepth(4);

        // Inicializar offset de cámara si no existe
        if (player.crowsNestCameraOffsetX === undefined) {
            player.crowsNestCameraOffsetX = 0;
            player.crowsNestCameraOffsetY = 0;
        }

        let targetOffsetX = 0;
        let targetOffsetY = 0;
        let playerRotation = player.rotation;

        const maxCameraOffset = 250; // Máximo desplazamiento de cámara en pixels

        // Solo procesar input WASD si inputEnabled = true
        if (inputEnabled) {
            let inputDetected = false;

            // Determinar offset objetivo basado en input (en coordenadas del mundo)
            if (input.keyW.isDown) {
                targetOffsetY = -maxCameraOffset;
                inputDetected = true;
            }
            if (input.keyS.isDown) {
                targetOffsetY = maxCameraOffset;
                inputDetected = true;
            }
            if (input.keyA.isDown) {
                targetOffsetX = -maxCameraOffset;
                inputDetected = true;
            }
            if (input.keyD.isDown) {
                targetOffsetX = maxCameraOffset;
                inputDetected = true;
            }

            // Normalizar offset diagonal
            if (targetOffsetX !== 0 && targetOffsetY !== 0) {
                targetOffsetX *= 0.707;
                targetOffsetY *= 0.707;
            }

            // Rotar jugador según dirección del input (en coordenadas ABSOLUTAS del mundo)
            if (inputDetected) {
                const directionAngles = {
                    "W":  Math.PI,                  // NORTE (absoluto)
                    "S":  0,                        // SUR (absoluto)
                    "A":  Math.PI / 2,              // OESTE (absoluto)
                    "D": -Math.PI / 2,              // ESTE (absoluto)
                    "WA": (3 * Math.PI) / 4,        // Noroeste
                    "WD": -(3 * Math.PI) / 4,       // Noreste
                    "SA": Math.PI / 4,              // Suroeste
                    "SD": -Math.PI / 4              // Sureste
                };

                let combo = "";
                if (input.keyW.isDown) combo += "W";
                if (input.keyS.isDown) combo += "S";
                if (input.keyA.isDown) combo += "A";
                if (input.keyD.isDown) combo += "D";

                const angle = directionAngles[combo];
                if (angle !== undefined) {
                    playerRotation = angle;
                    player.lastRotation = playerRotation;
                }
            }
        }

        // Interpolar suavemente hacia el offset objetivo
        const lerpSpeed = 3.0 * deltaTime;
        player.crowsNestCameraOffsetX = Phaser.Math.Linear(
            player.crowsNestCameraOffsetX,
            targetOffsetX,
            lerpSpeed
        );
        player.crowsNestCameraOffsetY = Phaser.Math.Linear(
            player.crowsNestCameraOffsetY,
            targetOffsetY,
            lerpSpeed
        );

        // Posición de la cofa (en la proa del barco) - FIJA
        const crowsNestOffset = 60;
        const angle = ship.rotation - Math.PI / 2;
        const crowsNestCenterX = ship.x + Math.cos(angle) * crowsNestOffset;
        const crowsNestCenterY = ship.y + Math.sin(angle) * crowsNestOffset;

        // Posicionar jugador FIJO en el centro de la cofa
        player.setPosition(crowsNestCenterX, crowsNestCenterY);
        player.setVelocity(0, 0);

        // Aplicar offset de cámara directamente al scroll de la cámara
        if (self.cameras && self.cameras.main) {
            const camera = self.cameras.main;

            // Detener el follow automático CADA frame (en caso de que otro sistema lo reactive)
            camera.stopFollow();
            player.crowsNestCameraManualControl = true;

            // Calcular la posición base que la cámara debería tener (centrada en el jugador)
            const baseCameraX = crowsNestCenterX - camera.width / 2;
            const baseCameraY = crowsNestCenterY - camera.height / 2;

            // Aplicar el offset de pan de cámara manualmente
            camera.setScroll(
                baseCameraX + player.crowsNestCameraOffsetX,
                baseCameraY + player.crowsNestCameraOffsetY
            );
        }

        // Ajustar rotación del jugador cuando el barco rota
        if (ship.previousRotation !== undefined) {
            const rotationDelta = ship.rotation - ship.previousRotation;
            if (Math.abs(rotationDelta) > 0.001) {
                player.lastRotation += rotationDelta;
            }
        }

        // Aplicar rotación
        player.setRotation(player.lastRotation);

        // No hay animación de caminar en la cofa (jugador quieto)
        if (player.anims.isPlaying) {
            player.stop();
            player.setFrame('tile000.png');
        }

    } else if (player.isFishing) {
        // El jugador ESTÁ pescando - no puede caminar
        player.setVelocity(0, 0);

        // Player normal depth when fishing
        player.setDepth(3);

        // Stop animation when fishing
        if (player.anims.isPlaying) {
            player.stop();
            player.setFrame('tile000.png');
        }

        // Obtener la caña actual desde el barco
        const currentRod = player.fishingSide === 'left' ? ship.fishingRods.left : ship.fishingRods.right;

        if (currentRod) {
            // Posicionar jugador detrás de la caña basado en su rotación
            const offsetDistance = 35; // Distancia detrás de la caña
            const playerX = currentRod.x - Math.cos(currentRod.rotation) * offsetDistance;
            const playerY = currentRod.y - Math.sin(currentRod.rotation) * offsetDistance;

            player.setPosition(playerX, playerY);

            // El jugador mira en la misma dirección que la caña
            player.setRotation(currentRod.rotation - Math.PI / 2);
        }

    } else {
        // El jugador ESTÁ en el timón - no puede caminar
        player.setVelocity(0, 0);

        // Player normal depth when controlling ship
        player.setDepth(3);

        // Stop animation when controlling ship
        if (player.anims.isPlaying) {
            player.stop();
            player.setFrame('tile000.png');
        }

        // Posición del timón (en la popa del barco)
        const helmOffset = 125;
        const angle = ship.rotation - Math.PI / 2;
        const helmX = ship.x - Math.cos(angle) * helmOffset;
        const helmY = ship.y - Math.sin(angle) * helmOffset;

        player.setPosition(helmX, helmY);

        // El jugador mira en la dirección del barco (hacia adelante)
        player.setRotation(ship.rotation + Math.PI);
    }

    // Update held item sprite position
    if (player.heldItem) {
        // Create sprite if it doesn't exist
        if (!player.heldItemSprite) {
            // Create a brown square for fish (6x6)
            const graphics = self.add.graphics();
            graphics.fillStyle(0x8B4513, 1); // Brown color
            graphics.fillRect(0, 0, 6, 6);
            graphics.generateTexture('fish_item', 6, 6);
            graphics.destroy();

            player.heldItemSprite = self.add.sprite(0, 0, 'fish_item')
                .setOrigin(0.5, 0.5)
                .setDepth(player.depth + 1);
        }

        // Position item in front of player (in their "hand")
        const handOffset = 12;
        const itemX = player.x + Math.cos(player.rotation - Math.PI / 2) * handOffset;
        const itemY = player.y + Math.sin(player.rotation - Math.PI / 2) * handOffset;
        player.heldItemSprite.setPosition(itemX, itemY);
        player.heldItemSprite.setVisible(true);
    } else if (player.heldItemSprite) {
        // Hide item if not holding anything
        player.heldItemSprite.setVisible(false);
    }

    // WRAP DESHABILITADO - Ahora usamos sistema de rooms en lugar de wrap
    // Ya no hacemos wrap del barco porque necesitamos detectar cuando cruza los bordes
    // para hacer la transición entre rooms

    // Código original (comentado):
    // const relativeX = player.x - ship.x;
    // const relativeY = player.y - ship.y;
    // self.physics.world.wrap(ship, 0);
    // player.setPosition(ship.x + relativeX, ship.y + relativeY);
}
