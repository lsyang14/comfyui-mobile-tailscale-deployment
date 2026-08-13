# 国内镜像：群晖/测试环境无需访问 Docker Hub
FROM m.daocloud.io/docker.io/library/node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com \
    && npm ci --omit=dev \
    && npm cache clean --force
COPY src ./src
COPY worker ./worker
COPY public ./public
COPY workflow-krea2.json ./
COPY workflow-krea2-hd4k.json ./
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node","src/server.js"]
