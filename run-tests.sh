#!/bin/bash

docker run -it --rm -v "$(pwd)":/app -w /app node:latest sh -c "npm install && npm test"
