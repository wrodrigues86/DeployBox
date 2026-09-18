FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       make \
       g++ \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm ci

COPY server ./server
COPY client ./client

RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npm", "run", "start"]
