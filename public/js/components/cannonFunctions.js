////////////////////////////////////////////////// CANNON FUNCTIONS

// Constantes
const CANNON_ROTATION_SPEED = 1.5; // radianes por segundo
const CANNON_MAX_ANGLE = Math.PI / 3; // ±60 grados
const CANNON_OFFSET = 75; // Distancia del cañón desde el centro del barco

/**
 * Crear los sprites de cañón en el barco
 */
function createCannons(self, ship) {
    const cannons = {
        left: null,
        right: null
    };

    // Cañón izquierdo
    cannons.left = self.add.sprite(0, 0, 'cannon')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(78, 30)
        .setDepth(2.5);
    cannons.left.relativeAngle = 0; // Ángulo relativo al barco
    cannons.left.side = 'left';

    // Cañón derecho
    cannons.right = self.add.sprite(0, 0, 'cannon')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(78, 30)
        .setDepth(2.5);
    cannons.right.relativeAngle = 0; // Ángulo relativo al barco
    cannons.right.side = 'right';

    return cannons;
}

/**
 * Actualizar la posición de los cañones según la posición del barco
 */
function updateCannonPosition(cannon, ship, side) {
    if (!cannon || !ship) return;

    const shipAngle = ship.rotation - Math.PI / 2;

    if (side === 'left') {
        // Cañón izquierdo (perpendicular izquierdo del barco)
        cannon.x = ship.x + Math.cos(shipAngle - Math.PI / 2) * CANNON_OFFSET;
        cannon.y = ship.y + Math.sin(shipAngle - Math.PI / 2) * CANNON_OFFSET;
        // Rotación = rotación del barco + 180° (apuntar hacia la izquierda) + ángulo relativo
        cannon.rotation = ship.rotation + Math.PI + cannon.relativeAngle;
    } else if (side === 'right') {
        // Cañón derecho (perpendicular derecho del barco)
        cannon.x = ship.x + Math.cos(shipAngle + Math.PI / 2) * CANNON_OFFSET;
        cannon.y = ship.y + Math.sin(shipAngle + Math.PI / 2) * CANNON_OFFSET;
        // Rotación = rotación del barco + 0° (apuntar hacia la derecha) + ángulo relativo
        cannon.rotation = ship.rotation + cannon.relativeAngle;
    }
}

/**
 * Montar al jugador en el cañón
 */
function mountCannon(player, cannon, side) {
    player.isOnCannon = true;
    player.cannonSide = side;
    player.canMove = false;

    // Posicionar jugador detrás del cañón basado en su rotación
    const offsetDistance = 20; // Distancia detrás del cañón
    player.x = cannon.x - Math.cos(cannon.rotation) * offsetDistance;
    player.y = cannon.y - Math.sin(cannon.rotation) * offsetDistance;
    player.rotation = cannon.rotation;
}

/**
 * Desmontar al jugador del cañón
 */
function dismountCannon(player) {
    player.isOnCannon = false;
    player.cannonSide = null;
    player.canMove = true;
}

/**
 * Actualizar la rotación del cañón basado en las teclas A/D
 */
function updateCannonRotation(cannon, keyA, keyD, delta) {
    if (!cannon) return;

    const rotationChange = CANNON_ROTATION_SPEED * (delta / 1000);

    if (keyA.isDown) {
        // Rotar a la izquierda
        cannon.relativeAngle -= rotationChange;
    } else if (keyD.isDown) {
        // Rotar a la derecha
        cannon.relativeAngle += rotationChange;
    }

    // Aplicar límites de rotación (±60 grados)
    cannon.relativeAngle = Phaser.Math.Clamp(
        cannon.relativeAngle,
        -CANNON_MAX_ANGLE,
        CANNON_MAX_ANGLE
    );
}

/**
 * Disparar una bala de cañón
 */
function fireCannonball(self, cannon, ship, socket) {
    if (!cannon || !ship) return;

    // Crear datos de la bala
    const bulletData = {
        x: cannon.x,
        y: cannon.y,
        rotation: cannon.rotation,
        velocityX: Math.cos(cannon.rotation) * 750,
        velocityY: Math.sin(cannon.rotation) * 750,
        shooterId: ship.playerId
    };

    // Emitir al servidor
    socket.emit('createBullet', bulletData);

    // Efecto de cámara (sacudida)
    self.cameras.main.shake(100, 0.003);
}

/**
 * Verificar si el jugador está cerca del cañón
 */
function isNearCannon(player, cannon, threshold = 30) {
    if (!player || !cannon) return false;

    const distance = Phaser.Math.Distance.Between(
        player.x, player.y,
        cannon.x, cannon.y
    );

    return distance < threshold;
}

/**
 * Actualizar cañones de otros jugadores (sin física)
 */
function updateOtherPlayerCannon(cannon, ship, side, relativeAngle) {
    if (!cannon || !ship) return;

    cannon.relativeAngle = relativeAngle;
    updateCannonPosition(cannon, ship, side);
}
