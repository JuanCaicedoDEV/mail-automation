import os
import json
import logging
import urllib.parse
from typing import List, Dict, Optional, Any, Callable
from google import genai
from google.genai import types
import urllib.parse
import uuid
from pathlib import Path
import httpx
from io import BytesIO
from PIL import Image as PILImage

logger = logging.getLogger(__name__)

# Configure Gemini API
def get_genai_client(api_key: Optional[str] = None):
    """Returns a GenAI client. Prefers provided api_key, then environment."""
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    return genai.Client(api_key=key)

import asyncio
import random

async def retry_api_call(func, *args, retries=3, initial_delay=1, **kwargs):
    """
    Retries an async API call with exponential backoff.
    """
    delay = initial_delay
    for i in range(retries):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            is_quota_error = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e) or "Too Many Requests" in str(e)
            if is_quota_error and i < retries - 1:
                sleep_time = delay + random.uniform(0, 1) # Add jitter
                logger.warning(f"API Rate Limit hit. Retrying in {sleep_time:.2f}s... (Attempt {i+1}/{retries})")
                await asyncio.sleep(sleep_time)
                delay *= 2 # Exponential backoff
            else:
                raise e


async def analyze_brand(text_content: str, visual_content_url: Optional[str] = None, api_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Analyzes the brand identity from the provided text description and optional visual content (logo/image) using Gemini.
    Returns a JSON object with brand details.
    """
    client = get_genai_client(api_key)
    if not client:
        raise ValueError("GEMINI_API_KEY is not set. Please configure it in Settings.")

    prompt = f"""
    Actúa como un Director de Arte y Estratega de Marca Senior.

    Tu tarea es analizar la identidad de marca basándote en la información proporcionada (Texto y/o Imagen).
    Debes estructurar esta información en un perfil de marca coherente.

    Analiza los siguientes puntos:
    1. **Verbal Identity (Copywriting):** ¿Cómo hablan? (Tono, estilo) Basado en el texto.
    2. **Estética Visual:** 
       - Si se proporciona una imagen (Logo/Web), analízala PRIORITARIAMENTE para extraer la paleta de colores exacta y el estilo gráfico.
       - Si solo hay texto, deduce el estilo visual probable.
    3. **Colores:** Extrae los códigos HEX exactos de la imagen si está disponible.

    Genera un JSON ESTRICTO (sin markdown, sin texto extra) con la siguiente estructura exacta:

    {{
      "brand_name": "Nombre de la empresa (si se menciona) o 'Unknown'",
      "brand_voice": "Descripción del tono de voz.",
      "target_audience": "Público objetivo deducido.",
      "color_palette": ["#HEX_PRIMARY", "#HEX_SECONDARY", "#HEX_ACCENT"],
      "visual_style_description": "Descripción técnica del estilo visual.",
      "nano_banana_prompt_suffix": "Prompt para generar una imagen representativa. Formato en Inglés: 'Style: [Adjetivos]. Colors: [Colores]. UI Elements: [Elementos]. High fidelity, UX/UI masterpiece.'",
      "keywords": ["Palabra clave 1", "Palabra clave 2", "Palabra clave 3"]
    }}

    IMPORTANTE:
    - Responde ÚNICAMENTE con el objeto JSON.
    
    ---
    CONTEXTO TEXTUAL / URL CONTENT:
    {text_content[:30000]} 
    """

    contents = [prompt]
    
    if visual_content_url:
        try:
            logger.info(f"Fetching visual content from {visual_content_url}")
            async with httpx.AsyncClient() as http_client:
                 resp = await http_client.get(visual_content_url)
                 resp.raise_for_status()
                 image_data = resp.content
                 # Pass image to Gemini
                 contents.append(types.Part.from_bytes(data=image_data, mime_type="image/jpeg")) 
        except Exception as e:
            logger.warning(f"Failed to fetch/process visual content for analysis: {e}")

    try:
        response = await retry_api_call(
            client.aio.models.generate_content,
            model='gemini-2.5-flash',  # Required for this specific API key
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        text_response = response.text
        return json.loads(text_response.strip())
    except Exception as e:
        logger.error(f"Error analyzing brand with Gemini: {e}")
        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
             from fastapi import HTTPException
             raise HTTPException(
                status_code=429, 
                detail="Gemini API Quota Exceeded. Please try again later."
            )
        raise e

async def generate_image(prompt: str, input_image: Optional[PILImage.Image] = None, image_saver: Optional[Callable[[bytes, str, str], str]] = None, overlay_logo_url: Optional[str] = None, api_key: Optional[str] = None) -> str:
    """
    Generates an image based on the prompt using Gemini's Imagen 3 model via google-genai SDK.
    If input_image is provided, it attempts to use it for image-to-image generation (if supported) 
    or just uses the prompt derived from it.
    """
    client = get_genai_client(api_key)
    if not client:
        raise ValueError("GEMINI_API_KEY is not set. Please configure it in Settings.")

    try:
        # Configuration for image generation using the dedicated API
        response = await retry_api_call(
            client.aio.models.generate_images,
            model='imagen-4.0-fast-generate-001',
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="1:1"
            )
        )

        image_bytes = None
        if hasattr(response, 'generated_images') and response.generated_images:
            gen_img = response.generated_images[0]
            if hasattr(gen_img, 'image') and gen_img.image:
                try:
                    # Depending on SDK version, image might be a wrapped PILImage or raw bytes object
                    if hasattr(gen_img.image, 'image_bytes'):
                        image_bytes = gen_img.image.image_bytes
                    else:
                        img_byte_arr = BytesIO()
                        gen_img.image.save(img_byte_arr, format='PNG')
                        image_bytes = img_byte_arr.getvalue()
                except Exception as e:
                     logger.warning(f"Fallback to direct image bytes due to {e}")
                     if hasattr(gen_img, 'image_bytes') and gen_img.image_bytes:
                         image_bytes = gen_img.image_bytes

            elif hasattr(gen_img, 'image_bytes') and gen_img.image_bytes:
                image_bytes = gen_img.image_bytes

        if not image_bytes:
             raise ValueError("No image bytes found in response.generated_images")

        image = PILImage.open(BytesIO(image_bytes))

        # Overlay Logo if provided
        if overlay_logo_url:
            try:
                import httpx
                async with httpx.AsyncClient() as http_client:
                    resp = await http_client.get(overlay_logo_url)
                    resp.raise_for_status()
                    logo_bytes = resp.content
                    logo = PILImage.open(BytesIO(logo_bytes)).convert("RGBA")
                    
                    # Resize logo to be 15% of image width
                    target_width = int(image.width * 0.15)
                    if target_width > 0:
                        ratio = target_width / float(logo.width)
                        target_height = int(logo.height * ratio)
                        logo = logo.resize((target_width, target_height), PILImage.Resampling.LANCZOS)
                        
                        # Position: Bottom right with padding
                        padding = int(image.width * 0.05)
                        x = image.width - target_width - padding
                        y = image.height - target_height - padding
                        
                        # Overlay
                        image = image.convert("RGBA")
                        image.paste(logo, (x, y), logo)
                        image = image.convert("RGB") # Convert back to RGB
                        logger.info(f"Successfully overlaid logo {overlay_logo_url} at ({x}, {y})")
            except Exception as e:
                logger.error(f"Failed to overlay logo: {e}", exc_info=True)

        # Use callback if provided, else fallback to local (for backward compatibility during migration)
        # But ideally we always use the callback now.
        if image_saver:
            img_byte_arr = BytesIO()
            image.save(img_byte_arr, format='PNG')
            img_byte_arr = img_byte_arr.getvalue()
            
            filename = f"{uuid.uuid4()}.png"
            return image_saver(img_byte_arr, filename, "image/png")
        
        # Fallback Local Save (Legacy)
        filename = f"{uuid.uuid4()}.png"
        save_path = Path("generated_images") / filename
        save_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(save_path)
        return f"http://localhost:8000/images/{filename}"

    except Exception as e:
        logger.error(f"Image Generation failed: {e}")
        encoded_prompt = urllib.parse.quote(prompt[:50])
        return f"https://placehold.co/1024x1024/png?text={encoded_prompt}&font=roboto"

async def generate_post(brand_info: Dict[str, Any], prompt_details: str = "Create a generic promotional post", image_count: int = 1, input_image_url: Optional[str] = None, image_saver: Optional[Callable[[bytes, str, str], str]] = None, brand_logo_url: Optional[str] = None, api_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Generates an Instagram caption and multiple image prompts/images.
    If input_image_url is provided, it uses the image to guide the caption and image prompts.
    """
    client = get_genai_client(api_key)
    if not client:
        raise ValueError("GEMINI_API_KEY is not set. Please configure it in Settings.")

    input_image_data = None
    input_image_pil = None
    if input_image_url:
        try:
            # Download the image
            # Since we are local, if it's localhost, we can try to read file or just download
            async with httpx.AsyncClient() as http_client:
                resp = await http_client.get(input_image_url)
                resp.raise_for_status()
                input_image_data = resp.content
                input_image_pil = PILImage.open(BytesIO(input_image_data))
        except Exception as e:
            logger.error(f"Failed to download input image: {e}")

    prompt_text = f"""
    Based on the following context and post details, generate an Instagram caption and {image_count} distinct image generation prompts.

    CONTEXT:
    {json.dumps(brand_info, indent=2) if brand_info else "No specific brand guidelines provided. Focus entirely on the POST DETAILS."}

    POST DETAILS:
    {prompt_details}

    """
    
    if input_image_data:
        prompt_text += "\n\nAn input image has been provided. \n1. Analyze this image and use it as the primary visual reference for the caption.\n2. For the 'image_prompts', describe how to EDIT or RECREATE this image to match the desired style better, or generate variations of it."
    
    prompt_text += f"""
    OUTPUT FORMAT (Strict JSON):
    {{
        "subject": "Catchy email subject line",
        "body": "Main content of the newsletter/email (Intro + Value Prop)...",
        "offer_details": "Specific details about the discount or offer (Capa 1/Benefit)...",
        "call_to_action": "Button text or call to action...",
    """
    
    if image_count > 0:
        prompt_text += f"""
        "image_prompts": [
            "Detailed prompt for image 1...",
            "Detailed prompt for image 2..."
        ]
        }}
        Ensure you generate exactly {image_count} prompts in the array.
        """
    else:
        prompt_text += f"""
        "image_prompts": []
        }}
        """

    contents = [prompt_text]
    if input_image_data:
        # Pass the image to Gemini for analysis (Multimodal)
        contents.append(types.Part.from_bytes(data=input_image_data, mime_type="image/jpeg")) # Assuming jpeg/png, API handles detection usually or strictly mime

    try:
        response = await retry_api_call(
            client.aio.models.generate_content,
            model='gemini-2.5-flash', # Multimodal model for text/caption generation
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        text_response = response.text
        try:
             result = json.loads(text_response.strip())
        except json.JSONDecodeError:
             # Fallback cleanup
             cleaned_text = text_response.replace("```json", "").replace("```", "")
             result = json.loads(cleaned_text.strip())
        
        image_prompts = result.get("image_prompts", [])
        if isinstance(image_prompts, str):
            image_prompts = [image_prompts]
        
        final_prompts = []
        prompt_suffix = brand_info.get('prompt_suffix', '') if brand_info else ''
        
        for i, img_prompt in enumerate(image_prompts[:image_count]):
            p = f"{img_prompt}"
            if prompt_suffix:
                p += f". {prompt_suffix}"
            final_prompts.append(p)
            
        while len(final_prompts) < image_count:
            variant_prompt = f"{prompt_details} - Variation {len(final_prompts)+1}"
            if prompt_suffix:
                variant_prompt += f". {prompt_suffix}"
            final_prompts.append(variant_prompt)
            
        import asyncio
        logger.info(f"Generating {len(final_prompts)} images in parallel...")
        logger.info(f"Generated Image Prompts: {json.dumps(final_prompts, indent=2)}")
        
        tasks = [generate_image(prompt, input_image=input_image_pil if input_image_data else None, image_saver=image_saver, overlay_logo_url=brand_logo_url, api_key=api_key) for prompt in final_prompts]
        generated_urls = await asyncio.gather(*tasks)

        result["image_urls"] = generated_urls 
        if "image_url" in result:
            del result["image_url"]
            
        return result
    except Exception as e:
        logger.error(f"Error generating post content with Gemini: {e}")
        raise
