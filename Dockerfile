FROM node:22-alpine
ENV PORT=3000

WORKDIR app

# Copy dependency files first for better caching
COPY package.json package-lock.json ./
RUN npm ci --include=optional

# Copy application files
COPY . .
RUN npm run build

EXPOSE $PORT
CMD npm run start-local
