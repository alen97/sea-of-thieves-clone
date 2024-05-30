FROM node:16.17.0-alpine

WORKDIR /server

# Copio archivos a /server
COPY . .

RUN npm install

CMD ["node", "server.js"]