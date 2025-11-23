#!/bin/bash

echo "🔐 Setting up local development environment for fc-backend"
echo ""

# Check if .env already exists
if [ -f .env ]; then
  echo "⚠️  .env file already exists!"
  read -p "Overwrite? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborting. Using existing .env file."
    exit 0
  fi
fi

# Generate random secrets
echo "🔑 Generating secure random secrets..."
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)

# Create .env file
cat > .env << EOF
# Environment
NODE_ENV=development

# Server
PORT=5000

# Database - Local MongoDB
MONGODB_URI=mongodb://localhost:27017/figure-collector-dev

# JWT Secrets (auto-generated on $(date +%Y-%m-%d))
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

# JWT Configuration
ACCESS_TOKEN_EXPIRY=15m

# Refresh Token Rotation (optional)
# ROTATE_REFRESH_TOKENS=true

# Services
SCRAPER_SERVICE_URL=http://localhost:3000
EOF

echo "✅ .env file created with randomly generated secrets"
echo ""
echo "📝 Configuration summary:"
echo "   Database: Local MongoDB (mongodb://localhost:27017/figure-collector-dev)"
echo "   Port: 5000"
echo "   JWT secrets: Generated"
echo ""
echo "💡 To use MongoDB Atlas instead:"
echo "   1. Edit .env"
echo "   2. Replace MONGODB_URI with your Atlas connection string"
echo ""
echo "🚀 Next steps:"
echo "   1. Start MongoDB: docker run -d -p 27017:27017 --name mongodb mongo:latest"
echo "   2. Start backend: npm run dev"
echo ""
