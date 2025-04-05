#!/bin/bash
# Script to rebuild and start Docker containers or just stop them

# Check if the stop argument was provided
if [ "$1" = "stop" ]; then
    echo "Stopping containers..."
    docker-compose down
    echo "Containers stopped."
    exit 0
fi

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
