/**
 * Muestra una burbuja de chat sobre un jugador
 * @param {Phaser.Scene} scene - La escena de Phaser
 * @param {Phaser.GameObjects.Sprite} player - El jugador sobre el que mostrar el mensaje
 * @param {string} message - El mensaje a mostrar
 * @param {number} duration - Duración en milisegundos (default: 3500ms)
 */
function showChatBubble(scene, player, message, duration = 3500) {
  // Limitar longitud del mensaje
  const truncatedMessage = message.length > 50 ? message.substring(0, 50) + '...' : message;

  // Destruir burbujas anteriores del jugador si existen
  if (player.chatBubbles && player.chatBubbles.length > 0) {
    player.chatBubbles.forEach(bubble => bubble.destroy());
    player.chatBubbles = [];
  }

  // Crear el texto del chat
  const chatText = scene.add.text(
    player.x,
    player.y - 30,
    truncatedMessage,
    {
      fontSize: '14px',
      fill: '#ffffff',
      backgroundColor: '#000000dd',
      padding: { x: 8, y: 4 },
      wordWrap: { width: 200 },
      align: 'center'
    }
  );

  chatText.setDepth(100);
  chatText.setOrigin(0.5, 1); // Centrado horizontalmente, anclado en la parte inferior

  // Inicializar array de burbujas si no existe
  if (!player.chatBubbles) {
    player.chatBubbles = [];
  }

  // Agregar referencia a la burbuja
  player.chatBubbles.push(chatText);

  // Auto-destruir después de la duración especificada
  scene.time.addEvent({
    delay: duration,
    callback: () => {
      chatText.destroy();

      // Remover del array
      const index = player.chatBubbles.indexOf(chatText);
      if (index > -1) {
        player.chatBubbles.splice(index, 1);
      }
    }
  });

  return chatText;
}

/**
 * Actualiza la posición de todas las burbujas de chat de un jugador
 * @param {Phaser.GameObjects.Sprite} player - El jugador cuyas burbujas actualizar
 */
function updateChatBubblePosition(player) {
  if (player.chatBubbles && player.chatBubbles.length > 0) {
    player.chatBubbles.forEach((bubble) => {
      // Actualizar posición para seguir al jugador
      bubble.setPosition(player.x, player.y - 30);
    });
  }
}

/**
 * Envía un mensaje de chat al servidor
 * @param {Phaser.Scene} scene - La escena de Phaser que tiene el socket
 * @param {string} message - El mensaje a enviar
 */
function sendChatMessage(scene, message) {
  if (!message || message.trim() === '') {
    return;
  }

  // Limitar a 50 caracteres
  const trimmedMessage = message.trim().substring(0, 50);

  // Emitir al servidor
  scene.socket.emit('chatMessage', {
    message: trimmedMessage,
    x: scene.ship.x,
    y: scene.ship.y
  });
}
