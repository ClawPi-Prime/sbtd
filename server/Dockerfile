# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root package files
COPY package.json ./
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# Copy source
COPY shared/ ./shared/
COPY server/ ./server/

# Install workspace deps (creates node_modules with all deps)
RUN npm install --workspace=server

# Build server (tsconfig paths resolve shared via ../shared/src)
WORKDIR /app/server
RUN npm run build

# Stage 2: Run
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/server/package.json ./
COPY --from=builder /app/server/dist/ ./dist/

RUN npm install --production

EXPOSE 2567

ENV NODE_ENV=production
ENV PORT=2567

CMD ["node", "dist/server/src/index.js"]
