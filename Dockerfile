FROM node:18-alpine
ENV PORT=3000

WORKDIR app
COPY . .

COPY package.json .
COPY package-lock.json .
RUN npm ci
RUN npm run build

EXPOSE $PORT
CMD npm run start-local
