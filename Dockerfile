FROM node:18-alpine
ENV PORT=3000

WORKDIR app
COPY . .

COPY package.json .
COPY package-lock.json .
RUN npm ci
RUN npm run build

# TEMPORARY: Clear legacy cache format (remove after next release)
RUN mkdir -p cache/figma-files && \
    find cache/figma-files -name "*.analysis.md" -type f ! -name "*_*" -delete 2>/dev/null || true

EXPOSE $PORT
CMD npm run start-local
