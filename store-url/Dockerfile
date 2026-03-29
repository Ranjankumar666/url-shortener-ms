FROM node:22-alpine3.23

WORKDIR /app
COPY package*.json ./
RUN  npm ci --only=production
COPY . .

CMD [ "node", "index.js" ]

