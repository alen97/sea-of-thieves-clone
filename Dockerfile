FROM node:20-alpine

WORKDIR /app

# Copiar package.json primero para mejor cache de Docker
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar el resto de archivos
COPY . .

# Exponer puerto
EXPOSE 80

# Comando para iniciar
CMD ["node", "server.js"]