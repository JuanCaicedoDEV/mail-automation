import requests
import time

BASE_URL = "http://localhost:8000"
API_KEY = "your_secret_key" # Replace if needed, but local env might not enforce it strictly if not set
HEADERS = {"X-API-Key": API_KEY}

def test_brand_flow():
    print("1. Creating Brand...")
    brand_payload = {
        "name": "Test Brand",
        "website_url": "https://example.com",
        "brand_dna": {
            "voice": "Professional",
            "style": "Minimalist"
        }
    }
    res = requests.post(f"{BASE_URL}/brands", json=brand_payload, headers=HEADERS)
    if res.status_code != 200:
        print(f"Failed to create brand: {res.text}")
        return
    brand_id = res.json()["id"]
    print(f"Brand Created: ID {brand_id}")

    print("2. Creating Campaign with Brand...")
    campaign_payload = {
        "name": "Branded Campaign",
        "master_prompt": "Sell more widgets",
        "brand_id": brand_id
    }
    res = requests.post(f"{BASE_URL}/campaigns", json=campaign_payload, headers=HEADERS)
    if res.status_code != 200:
        print(f"Failed to create campaign: {res.text}")
        return
    campaign_id = res.json()["id"]
    print(f"Campaign Created: ID {campaign_id}")

    print("3. Fetching Campaigns to verify link...")
    res = requests.get(f"{BASE_URL}/campaigns", headers=HEADERS)
    campaigns = res.json()
    my_campaign = next((c for c in campaigns if c["id"] == campaign_id), None)
    if my_campaign and my_campaign.get("brand_id") == brand_id:
        print("Campaign successfully linked to Brand.")
    else:
        print(f"Campaign link verification failed: {my_campaign}")

    print("4. Creating Post...")
    post_payload = {
        "specific_prompt": "Test post",
        "image_count": 1,
        "type": "POST"
    }
    res = requests.post(f"{BASE_URL}/campaigns/{campaign_id}/posts", json=post_payload, headers=HEADERS)
    if res.status_code != 200:
        print(f"Failed to create post: {res.text}")
        return
    post_id = res.json()["id"]
    print(f"Post Created: ID {post_id}")
    
    print("Test Complete.")

if __name__ == "__main__":
    test_brand_flow()
