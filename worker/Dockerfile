FROM node:22-bookworm-slim
WORKDIR /worker
COPY package.json ./
COPY ../src ./src
COPY ../workflow-krea2.json ./
COPY server.js ./
CMD ["node","server.js"]
