#!/bin/bash

echo "🚀 Setting up Parcel Intelligence Platform..."

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from .env.example"
    echo "⚠️  Please update .env with your actual API keys:"
    echo "   - Supabase URL and anon key"
    echo "   - Mapbox API key"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with your API keys"
echo "2. Run 'npm run dev' to start the development server"
echo "3. Connect to Supabase using the button in the top right"