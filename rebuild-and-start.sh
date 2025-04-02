#!/bin/bash
# Script to rebuild and start Docker containers

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo "Stopping running containers..."
    docker-compose down
fi

echo "Rebuilding and starting containers..."
docker-compose up --build -d

echo "Containers rebuilt and started in detached mode."

# Ask if user wants to view logs
read -p "Do you want to view the logs now? (y/n): " view_logs
if [[ "$view_logs" =~ ^[Yy]$ ]]; then
    echo "Showing logs (press Ctrl+C to exit)..."
    docker-compose logs -f
else
    echo "To view logs later, run: docker-compose logs -f"
fi
