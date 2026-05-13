FROM node:20-alpine
ENV PORT=3000

# Install fonts required for SVG-to-PNG text rendering (sharp/librsvg)
RUN apk add --no-cache fontconfig ttf-dejavu ttf-liberation font-noto-core \
    && fc-cache -f

WORKDIR /app
COPY package.json package-lock.json ./
# npm ci with explicit rollup native binary for Alpine Linux (musl)
RUN npm ci && npm install @rollup/rollup-linux-x64-musl --save-optional
COPY . .
RUN npm run build

EXPOSE $PORT
CMD npm run start-local
