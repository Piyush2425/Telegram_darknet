# Stage 1: Build React frontend
FROM node:18-alpine AS build

WORKDIR /app

# Install package dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy sources and build the production bundle
COPY . .
RUN npm run build

# Stage 2: Serve built assets using Nginx
FROM nginx:alpine

# Copy built assets from stage 1
COPY --from=build /app/dist /usr/share/nginx/html

# Copy customized Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
