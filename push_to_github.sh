#!/bin/bash
set -e

echo "🚀 Initializing local Git repository..."
git init

echo "📦 Staging files..."
git add .

echo "💾 Committing files..."
git commit -m "Initial commit of World Cup 2026 Simulator"

echo "🌿 Setting default branch to main..."
git branch -M main

# Check if origin already exists
if git remote | grep -q 'origin'; then
  echo "🔗 Replacing existing origin remote..."
  git remote set-url origin git@github.com:vikentc/world-cup-simulator.git
else
  echo "🔗 Adding origin remote..."
  git remote add origin git@github.com:vikentc/world-cup-simulator.git
fi

echo "📤 Pushing to GitHub (using SSH key)..."
git push -u origin main

echo "✅ Success! Project successfully pushed to GitHub."
