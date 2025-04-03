FROM node:22-alpine

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source files (tests excluded via .dockerignore)
COPY src/ ./src/

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
