FROM node:20-slim

WORKDIR /usr/src/app

# Copy shared types first (server depends on these)
COPY shared/ ./shared/

# Copy server package files and install deps
COPY server/package*.json ./server/
RUN cd server && npm install

# Copy server source and build
COPY server/ ./server/
RUN cd server && npm run build

WORKDIR /usr/src/app/server

CMD [ "npm", "start" ]
