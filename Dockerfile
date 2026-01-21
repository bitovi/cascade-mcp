FROM node:20-alpine
ENV PORT=3000

WORKDIR app
COPY package.json package-lock.json ./
# Use npm install to resolve platform-specific optional dependencies (rollup native binaries)
RUN npm install --frozen-lockfile || npm install
COPY . .
RUN npm run build

EXPOSE $PORT
CMD npm run start-local
