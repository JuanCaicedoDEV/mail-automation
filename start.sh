#!/bin/bash

# Vision Media 1.0 - Content Engine
# Unified Start Script

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Vision Media 1.0 - Content Engine${NC}"
echo -e "------------------------------------"

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found!${NC}"
    if [ -f .env.example ]; then
        echo -e "Creating .env from .env.example..."
        cp .env.example .env
        echo -e "${GREEN}✅ .env created. Please edit it with your API keys.${NC}"
    else
        echo -e "${RED}❌ .env.example not found. Please create a .env file.${NC}"
        exit 1
    fi
fi

# Choose running mode
echo -e "\nHow would you like to run the application?"
echo "1) 🐳 Docker (Recommended, handles all dependencies)"
echo "2) 🐍 Locally (Requires Python 3.11 and Node.js 20)"
read -p "Select an option [1-2]: " choice

if [ "$choice" == "1" ]; then
    echo -e "\n${BLUE}Starting with Docker...${NC}"
    docker-compose up -d --build
    echo -e "\n${GREEN}✅ Application started!${NC}"
    echo -e "Dashboard: ${BLUE}http://localhost:5173${NC}"
    echo -e "API Docs:  ${BLUE}http://localhost:8000/docs${NC}"
    echo -e "\nRun '${YELLOW}docker-compose logs -f${NC}' to see the logs."

elif [ "$choice" == "2" ]; then
    echo -e "\n${BLUE}Starting Locally...${NC}"

    # Backend Setup
    echo -e "\n${BLUE}[Backend]${NC} Setting up Python environment..."
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi
    source .venv/bin/activate
    pip install -r backend/requirements.txt

    # Frontend Setup
    echo -e "\n${BLUE}[Frontend]${NC} Checking dependencies..."
    cd apps/dashboard
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    cd ../..

    # Running both
    echo -e "\n${GREEN}🚀 Starting Backend and Frontend concurrently...${NC}"
    
    # Run backend in background
    source .venv/bin/activate
    export $(grep -v '^#' .env | xargs)
    uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload &
    BACKEND_PID=$!

    # Run frontend
    cd apps/dashboard
    npm run dev &
    FRONTEND_PID=$!

    echo -e "\n${GREEN}✅ Processes started!${NC}"
    echo -e "Backend PID: $BACKEND_PID"
    echo -e "Frontend PID: $FRONTEND_PID"
    echo -e "\nPress Ctrl+C to stop both."

    # Handle termination
    trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
    wait

else
    echo -e "${RED}Invalid selection. Exiting.${NC}"
    exit 1
fi
