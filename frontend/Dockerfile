# Build stage
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine

# Copy built assets to Nginx default public folder
COPY --from=builder /app/dist /usr/share/nginx/html

# The docker-compose will mount a custom nginx.conf to route /api traffic
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
