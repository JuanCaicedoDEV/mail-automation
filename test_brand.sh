#!/bin/bash
API_URL="http://localhost:8000"
# Load API Key from .env or use a default if you know it
# Assuming API_SECRET_KEY is provided in .env or docker-compose
if [ -f .env ]; then
  export $(cat .env | xargs)
fi

KEY=${API_SECRET_KEY:-"your_secret_key"} 
echo "Using API Key: $KEY"

echo "1. Creating Brand..."
BRAND_ID=$(curl -s -X POST "$API_URL/brands" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY" \
  -d '{
    "name": "Curl Brand",
    "website_url": "https://curl.se",
    "brand_dna": {"voice": "Technical", "style": "Terminal"}
  }' | jq -r '.id')

echo "Brand ID: $BRAND_ID"

if [ "$BRAND_ID" == "null" ]; then
  echo "Failed to create brand"
  exit 1
fi

echo "2. Creating Campaign..."
CAMPAIGN_ID=$(curl -s -X POST "$API_URL/campaigns" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY" \
  -d "{
    \"name\": \"Curl Campaign\",
    \"master_prompt\": \"Test via Curl\",
    \"brand_id\": $BRAND_ID
  }" | jq -r '.id')

echo "Campaign ID: $CAMPAIGN_ID"

echo "3. Creating Post..."
POST_ID=$(curl -s -X POST "$API_URL/campaigns/$CAMPAIGN_ID/posts" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY" \
  -d '{
    "specific_prompt": "Curl Post",
    "image_count": 1,
    "type": "POST"
  }' | jq -r '.id')

echo "Post ID: $POST_ID"
echo "Test Complete."
