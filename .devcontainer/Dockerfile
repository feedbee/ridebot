# Use the official Node.js image
FROM node:22

# Set the working directory
WORKDIR /workspace

# Install additional system packages if needed
RUN apt-get update && apt-get install -y \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install global npm packages
RUN npm install -g npm@latest && npm install -g nodemon

# Set the user to avoid running as root
USER node