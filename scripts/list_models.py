import os
import asyncio
from google import genai

async def list_models():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not set")
        return

    client = genai.Client(api_key=api_key)
    
    print("Listing available models...")
    try:
        pager = client.models.list(config={'page_size': 100})
        for model in pager:
            print(f"Name: {model.name}")
            print(f"  DisplayName: {model.display_name}")
            # print(f"  SupportedActions: {model.supported_generation_methods}")
            print("-" * 20)
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    asyncio.run(list_models())
