FROM node:8.5
WORKDIR /app

COPY package.json .
RUN npm install

COPY . .
CMD ["node", "."]
