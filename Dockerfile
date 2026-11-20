# Couchcade in a container, for machines that already run things in Docker.
#
#   docker build -t couchcade .
#   docker run --rm -p 3000:3000 -e HOST_IP=192.168.1.50 couchcade   # HOST_IP = this computer's LAN address
#   docker run --rm --network host couchcade                         # Linux only; finds the address itself
#
# Phones can't reach the container's own address (172.17.x.x), so the QR code needs HOST_IP,
# unless the container shares the host's network.

FROM node:26-alpine

WORKDIR /app
# PORT is fixed here because the -p mapping is; logs go to the terminal (docker logs), not a file.
ENV NODE_ENV=production PORT=3000 LOG_FILE=off

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY bin ./bin
COPY server ./server
COPY public ./public

USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
