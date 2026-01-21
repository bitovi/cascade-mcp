FROM node:20-alpine
ENV PORT=3000

WORKDIR /app
COPY package.json package-lock.json ./
# npm ci with explicit rollup native binary for Alpine Linux (musl)
RUN npm ci && npm install @rollup/rollup-linux-x64-musl --save-optional
COPY . .
RUN npm run build

EXPOSE $PORT
CMD npm run start-local
