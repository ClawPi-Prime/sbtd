# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root package files
COPY package.json ./
COPY client/package.json ./client/
COPY shared/package.json ./shared/

# Copy source
COPY shared/ ./shared/
COPY client/ ./client/

# Install dependencies
RUN npm install --workspace=client

# Build the client
WORKDIR /app/client
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
