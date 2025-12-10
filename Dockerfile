FROM node:18-alpine
ENV PORT=3000

WORKDIR app
COPY . .

COPY package.json .
COPY package-lock.json .
RUN npm ci
RUN npm run build

# Debug: Show build output
RUN echo "=== Build complete. Checking dist folder ===" && \
    ls -la && \
    echo "=== dist/ contents ===" && \
    ls -la dist/ 2>/dev/null || echo "dist/ does not exist" && \
    echo "=== dist/client/ contents ===" && \
    ls -la dist/client/ 2>/dev/null || echo "dist/client/ does not exist"

# Debug: Show pwd at runtime
RUN echo "=== Runtime path check ===" && \
    echo "pwd: $(pwd)" && \
    echo "Checking /app/dist/client/index.html:" && \
    ls -la /app/dist/client/index.html 2>/dev/null || echo "NOT FOUND at /app/dist/client/index.html" && \
    echo "Checking app/dist/client/index.html (relative):" && \
    ls -la app/dist/client/index.html 2>/dev/null || echo "NOT FOUND at app/dist/client/index.html"

EXPOSE $PORT
CMD npm run start-local
