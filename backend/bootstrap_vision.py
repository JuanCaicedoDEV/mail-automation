import asyncio
import os
import json
from execution import scraper, generator
import google.generativeai as genai

# Ensure API Key is set
if not os.getenv("GEMINI_API_KEY"):
    print("Please set GEMINI_API_KEY environment variable")
    exit(1)

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

async def bootstrap():
    # Example URL, can be changed
    url = "https://example.com/" 
    print(f"Scraping {url} for Vision Media analysis...")
    
    try:
        scraped_data = await scraper.scrape_website(url)
        html = scraped_data.get("html", "")
        
        print("Analyzing brand DNA with Gemini...")
        brand_dna = await generator.analyze_brand(html)
        
        print("\n--- BRAND DNA JSON ---")
        print(json.dumps(brand_dna, indent=2))
        print("----------------------\n")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(bootstrap())
