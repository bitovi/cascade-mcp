FROM node:18-alpine
ENV PORT=3000

WORKDIR app
COPY . .

COPY package.json .
COPY package-lock.json .
RUN npm ci

EXPOSE $PORT
CMD npm run start-local
