#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Step 1: Check for Node.js
print_header "Checking dependencies"

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js ≥18"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version must be ≥18. Current version: $(node -v)"
    exit 1
fi

print_success "Node.js $(node -v) found"

if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm"
    exit 1
fi

print_success "npm $(npm -v) found"

# Step 2: Check if Ollama is running
print_header "Checking for Ollama"

if timeout 2 curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    print_success "Ollama is running at http://localhost:11434"
else
    print_error "Ollama is not running or not accessible at http://localhost:11434"
    print_info "Start Ollama with: ollama serve"
    print_info "Proceeding anyway (you can start Ollama later)"
fi

# Step 3: Check for existing node_modules
print_header "Installing dependencies"

if [ ! -d "node_modules" ]; then
    print_info "Installing root dependencies..."
    npm install
    print_success "Root dependencies installed"
else
    print_info "Root node_modules already exists, skipping install"
fi

if [ ! -d "client/node_modules" ]; then
    print_info "Installing client dependencies..."
    npm install --prefix client
    print_success "Client dependencies installed"
else
    print_info "Client node_modules already exists, skipping install"
fi

# Step 4: Build the client
print_header "Building frontend"

print_info "Running Vite build..."
npm run build
print_success "Frontend built successfully"

# Step 5: Start the server
print_header "Starting Ollama Lyzer"

print_success "All systems ready!"
print_info "Starting server on http://127.0.0.1:3747"
echo ""

npm start
