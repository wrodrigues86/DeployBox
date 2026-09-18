FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm install

COPY server ./server
COPY client ./client

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
