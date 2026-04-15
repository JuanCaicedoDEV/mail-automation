import os
import json
import logging
from typing import List, Optional
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Request, status
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uuid
from execution import scraper, generator
from backend.storage import get_storage_provider
from backend import database
from backend.config_manager import (
    load_config, save_config, inject_into_env,
    is_setup_complete, get_masked_config,
    APP_DIR, DB_PATH
)
from .email_service import email_service
from urllib.parse import urlencode
import requests
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# ---------------------------------------------------------------------------
# Bootstrap: load config → inject into env so every module reads env vars
# ---------------------------------------------------------------------------
_config = load_config()
inject_into_env(_config)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Email Automation")

# ---------------------------------------------------------------------------
# CWD → APP_DIR first, so all relative paths work from Finder AND terminal
# (must happen BEFORE LocalStorageProvider tries to create ./uploads)
# ---------------------------------------------------------------------------
os.chdir(str(APP_DIR))
os.makedirs("generated_images", exist_ok=True)
os.makedirs("uploads", exist_ok=True)

# Storage (initialised after chdir so relative paths resolve correctly)
storage = get_storage_provider()
logger.info(f"Storage: {type(storage).__name__}")

# ---------------------------------------------------------------------------
# Middleware: API key auth — skipped for localhost (desktop mode)
# ---------------------------------------------------------------------------
API_SECRET_KEY = os.getenv("API_SECRET_KEY")

@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    # Always skip for OPTIONS, docs, OAuth, and static assets
    skip_prefixes = ("/images", "/uploads", "/auth/", "/docs", "/openapi.json",
                     "/config", "/assets", "/favicon")
    if (request.method == "OPTIONS"
            or any(request.url.path.startswith(p) for p in skip_prefixes)
            or request.url.path == "/"):
        return await call_next(request)

    # Skip auth when request comes from localhost (desktop app)
    client_host = request.client.host if request.client else ""
    if client_host in ("127.0.0.1", "::1", "localhost"):
        return await call_next(request)

    # External requests still require API key
    if API_SECRET_KEY:
        import secrets
        api_key = request.headers.get("X-API-Key", "")
        if not secrets.compare_digest(api_key, API_SECRET_KEY):
            return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED,
                                content={"detail": "Invalid or missing API Key"})

    return await call_next(request)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000",
                   "http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Static files: generated images and user uploads
# ---------------------------------------------------------------------------
app.mount("/images", StaticFiles(directory="generated_images"), name="images")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class CampaignCreate(BaseModel):
    name: str
    master_prompt: str
    brand_id: Optional[int] = None

class BrandCreate(BaseModel):
    name: str
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    identity_description: Optional[str] = None
    brand_dna: dict = {}

class BrandGenerate(BaseModel):
    brand_context: Optional[str] = None
    url: Optional[str] = None
    logo_url: Optional[str] = None

class PostCreate(BaseModel):
    specific_prompt: str
    image_count: int = 1
    type: str = "POST"
    scheduled_at: Optional[datetime] = None
    input_image_url: Optional[str] = None
    use_as_content: bool = False

class PostStatusUpdate(BaseModel):
    status: str

class PostPatch(BaseModel):
    scheduled_at: Optional[datetime] = None
    caption: Optional[str] = None
    status: Optional[str] = None

class LeadCreate(BaseModel):
    email: str
    name: Optional[str] = None

class LeadResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    status: str
    sent_at: Optional[datetime]

class SendCampaignRequest(BaseModel):
    subject: str
    body_template: str

class PostUpdate(BaseModel):
    caption: str
    status: Optional[str] = None

# ---------------------------------------------------------------------------
# Startup / Shutdown
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    scheuler = AsyncIOScheduler()
    scheuler.add_job(
        email_service.get_access_token,
        trigger="interval",
        hours=1,
        max_instances=1,
        id="Zoho_Oauth_Flow",
        next_run_time=datetime.now()
    )
    scheuler.start()
    import asyncio
    app.state.pool = await database.create_pool(DB_PATH)
    logger.info("Database pool ready")
    asyncio.create_task(cron_loop())


@app.on_event("shutdown")
async def shutdown():
    if hasattr(app.state, "pool"):
        await app.state.pool.close()

# ---------------------------------------------------------------------------
# Config endpoints (no auth required — used by settings screen)
# ---------------------------------------------------------------------------
@app.get("/config/status")
async def config_status():
    cfg = load_config()
    # Check both config.json and env vars (env vars loaded from .env in dev mode)
    return {
        "setup_complete": is_setup_complete(cfg),
        "gmail_configured": bool(
            (cfg.get("google_client_id") or os.getenv("GOOGLE_CLIENT_ID")) and
            (cfg.get("google_client_secret") or os.getenv("GOOGLE_CLIENT_SECRET"))
        ),
        "smtp_configured": bool(
            (cfg.get("gmail_user") or os.getenv("GMAIL_USER")) and
            (cfg.get("gmail_app_password") or os.getenv("GMAIL_APP_PASSWORD"))
        ),
    }

@app.get("/config")
async def get_config():
    cfg = load_config()
    return get_masked_config(cfg)

@app.put("/config")
async def update_config(request: Request):
    body = await request.json()
    cfg = load_config()
    # Only update known keys; never overwrite with empty string if already set
    allowed = {
        "gemini_api_key", "google_client_id", "google_client_secret",
        "google_redirect_uri", "gmail_user", "gmail_app_password",
        "storage_provider", "supabase_url", "supabase_key", "supabase_bucket",
        "public_url", "zoho_email", "zoho_refresh_token",
    }
    for key in allowed:
        val = body.get(key)
        if val is not None and val != "":
            cfg[key] = val
        elif val == "" and key in body:
            # Allow explicit clear
            cfg[key] = ""
    save_config(cfg)
    inject_into_env(cfg)
    return {"ok": True, "setup_complete": is_setup_complete(cfg)}

# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok"}

# ---------------------------------------------------------------------------
# Campaign Endpoints
# ---------------------------------------------------------------------------
@app.post("/campaigns")
async def create_campaign(campaign: CampaignCreate):
    try:
        async with app.state.pool.acquire() as conn:
            campaign_id = await conn.fetchval("""
                INSERT INTO campaigns (name, master_prompt, brand_id)
                VALUES ($1, $2, $3)
                RETURNING id
            """, campaign.name, campaign.master_prompt, campaign.brand_id)
            return {"id": campaign_id, "name": campaign.name}
    except Exception as e:
        logger.error(f"Error creating campaign: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.get("/campaigns")
async def get_campaigns():
    try:
        async with app.state.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT c.id, c.name, c.master_prompt, c.created_at, c.brand_id, b.name as brand_name
                FROM campaigns c
                LEFT JOIN brands b ON c.brand_id = b.id
                ORDER BY c.created_at DESC
            """)
            return rows
    except Exception as e:
        logger.error(f"Error fetching campaigns: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: int):
    try:
        async with app.state.pool.acquire() as conn:
            await conn.execute("DELETE FROM posts WHERE campaign_id = $1", campaign_id)
            result = await conn.execute("DELETE FROM campaigns WHERE id = $1", campaign_id)
            if result == "DELETE 0":
                raise HTTPException(status_code=404, detail="Campaign not found")
            return {"message": "Campaign and its posts deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting campaign: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

# ---------------------------------------------------------------------------
# Brand Endpoints
# ---------------------------------------------------------------------------
@app.post("/brands/generate")
async def generate_brand_dna(input: BrandGenerate):
    try:
        content = input.brand_context or ""
        if input.url:
            website_content = await scraper.fetch_website_content(input.url)
            content += f"\n\n--- WEBSITE CONTENT ({input.url}) ---\n{website_content[:20000]}"
        if not content and not input.logo_url:
            raise HTTPException(status_code=400, detail="Provide at least 'brand_context', 'url', or 'logo_url'")
        brand_dna = await generator.analyze_brand(content, input.logo_url)
        return brand_dna
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating DNA: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate Brand DNA")

@app.post("/brands")
async def create_brand(brand: BrandCreate):
    try:
        async with app.state.pool.acquire() as conn:
            brand_id = await conn.fetchval("""
                INSERT INTO brands (name, website_url, logo_url, identity_description, brand_dna)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            """, brand.name, brand.website_url, brand.logo_url,
                brand.identity_description, json.dumps(brand.brand_dna))
            return {"id": brand_id, "name": brand.name}
    except Exception as e:
        logger.error(f"Error creating brand: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.get("/brands")
async def get_brands():
    try:
        async with app.state.pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM brands ORDER BY created_at DESC")
            brands = []
            for row in rows:
                b = dict(row)
                if b.get("brand_dna"):
                    try:
                        b["brand_dna"] = json.loads(b["brand_dna"])
                    except Exception:
                        pass
                brands.append(b)
            return brands
    except Exception as e:
        logger.error(f"Error fetching brands: {e}")
        raise HTTPException(status_code=500)

# ---------------------------------------------------------------------------
# Post Endpoints
# ---------------------------------------------------------------------------
@app.get("/campaigns/{campaign_id}/posts")
async def get_campaign_posts(campaign_id: int):
    try:
        async with app.state.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, campaign_id, specific_prompt, image_count, image_urls,
                       caption, status, scheduled_at, input_image_url, use_as_content,
                       type, created_at
                FROM posts
                WHERE campaign_id = $1
                ORDER BY created_at ASC
            """, campaign_id)
            return rows
    except Exception as e:
        logger.error(f"Error fetching campaign posts: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        if file.content_type not in ["image/jpeg", "image/png", "image/webp", "image/gif"]:
            raise HTTPException(status_code=400, detail="Invalid file type.")
        file_ext = file.filename.split(".")[-1].lower()
        if file_ext not in ["jpg", "jpeg", "png", "webp", "gif"]:
            raise HTTPException(status_code=400, detail="Invalid file extension.")
        filename = f"{uuid.uuid4()}.{file_ext}"
        url = storage.upload(file.file, filename, file.content_type)
        return {"url": url, "path": filename}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")

@app.post("/campaigns/{campaign_id}/posts")
async def create_post_in_campaign(campaign_id: int, post: PostCreate, background_tasks: BackgroundTasks):
    try:
        async with app.state.pool.acquire() as conn:
            post_id = await conn.fetchval("""
                INSERT INTO posts (campaign_id, specific_prompt, image_count, status,
                                   input_image_url, use_as_content, type)
                VALUES ($1, $2, $3, 'PENDING', $4, $5, $6)
                RETURNING id
            """, campaign_id, post.specific_prompt, post.image_count,
                post.input_image_url, int(post.use_as_content), post.type)

            def save_image(data, filename, content_type):
                return storage.upload(data, filename, content_type)

            background_tasks.add_task(
                process_post_generation, post_id, post.specific_prompt,
                post.image_count, post.input_image_url, post.use_as_content, save_image
            )
            return {"id": post_id, "status": "PENDING"}
    except Exception as e:
        logger.error(f"Error creating post: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

async def process_post_generation(post_id: int, prompt: str, image_count: int,
                                   input_image_url: str = None, use_as_content: bool = False,
                                   image_saver=None):
    try:
        brand_dna = {}
        master_prompt = ""
        logo_url = None

        async with app.state.pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT c.master_prompt, b.brand_dna, b.logo_url
                FROM posts p
                JOIN campaigns c ON p.campaign_id = c.id
                LEFT JOIN brands b ON c.brand_id = b.id
                WHERE p.id = $1
            """, post_id)
            if row:
                master_prompt = row["master_prompt"] or ""
                if row["brand_dna"]:
                    try:
                        brand_dna = json.loads(row["brand_dna"])
                    except Exception:
                        pass
                logo_url = row["logo_url"]

        full_prompt = f"Master Strategy: {master_prompt}\nSpecific Context: {prompt}"
        content = await generator.generate_post(
            brand_dna, full_prompt,
            image_count=0 if use_as_content else image_count,
            input_image_url=input_image_url,
            image_saver=image_saver,
            brand_logo_url=logo_url
        )

        if "subject" in content:
            caption = json.dumps({
                "subject": content.get("subject"),
                "body": content.get("body"),
                "offer_details": content.get("offer_details"),
                "call_to_action": content.get("call_to_action"),
            })
        else:
            caption = content.get("caption", "")

        image_urls = [input_image_url] if use_as_content and input_image_url else content.get("image_urls", [])

        async with app.state.pool.acquire() as conn:
            await conn.execute("""
                UPDATE posts SET caption = $1, image_urls = $2, status = 'APPROVED'
                WHERE id = $3
            """, caption, json.dumps(image_urls), post_id)

        logger.info(f"Generated content for post {post_id}")
    except Exception as e:
        logger.error(f"Failed to process post {post_id}: {e}")
        try:
            async with app.state.pool.acquire() as conn:
                await conn.execute("UPDATE posts SET status = 'FAILED' WHERE id = $1", post_id)
        except Exception:
            pass

@app.post("/posts/{post_id}/generate")
async def trigger_post_generation(post_id: int, background_tasks: BackgroundTasks):
    try:
        async with app.state.pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT specific_prompt, image_count, input_image_url, use_as_content
                FROM posts WHERE id = $1
            """, post_id)
            if not row:
                raise HTTPException(status_code=404, detail="Post not found")

            def save_image(data, filename, content_type):
                return storage.upload(data, filename, content_type)

            background_tasks.add_task(
                process_post_generation, post_id,
                row["specific_prompt"], row["image_count"],
                row["input_image_url"], bool(row["use_as_content"]), save_image
            )
            return {"message": "Generation started", "id": post_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering generation: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.put("/posts/{post_id}/status")
async def update_post_status(post_id: int, update: PostStatusUpdate):
    try:
        async with app.state.pool.acquire() as conn:
            result = await conn.execute("UPDATE posts SET status = $1 WHERE id = $2",
                                        update.status, post_id)
            if result == "UPDATE 0":
                raise HTTPException(status_code=404, detail="Post not found")
            return {"message": "Status updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating status: {e}")
        raise HTTPException(status_code=500)

@app.delete("/posts/{post_id}")
async def delete_post(post_id: int):
    try:
        async with app.state.pool.acquire() as conn:
            await conn.execute("DELETE FROM posts WHERE id = $1", post_id)
            return {"message": "Post deleted"}
    except Exception as e:
        logger.error(f"Error deleting post: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.put("/posts/{post_id}")
async def update_post(post_id: int, post: PostUpdate):
    try:
        async with app.state.pool.acquire() as conn:
            if post.status:
                await conn.execute("UPDATE posts SET caption = $1, status = $2 WHERE id = $3",
                                   post.caption, post.status, post_id)
            else:
                await conn.execute("UPDATE posts SET caption = $1 WHERE id = $2",
                                   post.caption, post_id)
            return {"message": "Post updated"}
    except Exception as e:
        logger.error(f"Error updating post: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.patch("/posts/{post_id}")
async def patch_post(post_id: int, update: PostPatch):
    try:
        async with app.state.pool.acquire() as conn:
            if update.scheduled_at is not None:
                await conn.execute("UPDATE posts SET scheduled_at = $1 WHERE id = $2",
                                   update.scheduled_at.isoformat(), post_id)
            if update.caption is not None:
                await conn.execute("UPDATE posts SET caption = $1 WHERE id = $2",
                                   update.caption, post_id)
            if update.status is not None:
                await conn.execute("UPDATE posts SET status = $1 WHERE id = $2",
                                   update.status, post_id)
            return {"message": "Post updated"}
    except Exception as e:
        logger.error(f"Error patching post: {e}")
        raise HTTPException(status_code=500)

# ---------------------------------------------------------------------------
# Email rendering helpers
# ---------------------------------------------------------------------------
def render_email_html(subject: str, body: str, offer_details: str = "",
                      call_to_action: str = "", image_url: str = "",
                      recipient_name: str = "{{name}}") -> str:
    api_url = os.getenv("API_URL", "http://127.0.0.1:8000").rstrip("/")
    final_image_url = ""
    if image_url:
        if image_url.startswith("http"):
            if "localhost:8000" in image_url or "127.0.0.1:8000" in image_url:
                if "localhost" not in api_url and "127.0.0.1" not in api_url:
                    final_image_url = image_url.replace("http://localhost:8000", api_url).replace("http://127.0.0.1:8000", api_url)
                else:
                    final_image_url = image_url
            else:
                final_image_url = image_url
        else:
            final_image_url = f"{api_url}{image_url}"

    body_html = body.replace("\n", "<br/>")

    html = f'''<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #ffffff;">
    {f'<img src="{final_image_url}" style="width: 100%; border-radius: 8px; margin-bottom: 20px;" alt="{subject}" />' if final_image_url else ''}
    <h1 style="color: #111; margin-bottom: 20px; font-size: 24px;">{subject}</h1>
    <p style="margin-bottom: 8px;">Hi {recipient_name},</p>
    <p style="line-height: 1.6;">{body_html}</p>'''

    if offer_details:
        html += f'''\n    <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 30px 0; border: 1px solid #e5e7eb;">
        <h3 style="margin-top: 0; color: #4F46E5;">Special Offer</h3>
        <p>{offer_details}</p>'''
        if call_to_action:
            html += f'''\n        <div style="text-align: center; margin-top: 20px;">
            <a href="#" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">{call_to_action}</a>
        </div>'''
        html += "\n    </div>"

    html += '''\n    <p style="font-size: 12px; color: #999; text-align: center; margin-top: 40px;">
        You received this email because you signed up for our newsletter.<br/>
        <a href="#" style="color: #999;">Unsubscribe</a>
    </p>
</div>'''
    return html


def parse_post_content(caption: str, image_urls_raw) -> dict:
    subject = "Updates from our campaign"
    body = ""
    offer_details = ""
    call_to_action = ""
    try:
        data = json.loads(caption) if caption else {}
        subject = data.get("subject", subject)
        body = data.get("body", "")
        offer_details = data.get("offer_details", "")
        call_to_action = data.get("call_to_action", "")
    except (json.JSONDecodeError, TypeError):
        body = caption or ""
    img_urls = []
    try:
        if image_urls_raw:
            img_urls = json.loads(image_urls_raw) if isinstance(image_urls_raw, str) else image_urls_raw
    except (json.JSONDecodeError, TypeError):
        pass
    return {
        "subject": subject, "body": body, "offer_details": offer_details,
        "call_to_action": call_to_action,
        "image_url": img_urls[0] if img_urls else "",
        "image_urls": img_urls,
    }

# ---------------------------------------------------------------------------
# Email preview / render
# ---------------------------------------------------------------------------
@app.get("/emails/{post_id}/preview")
async def preview_email(post_id: int):
    try:
        async with app.state.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT caption, image_urls FROM posts WHERE id = $1", post_id)
            if not row:
                raise HTTPException(status_code=404, detail="Post not found")
            content = parse_post_content(row["caption"], row["image_urls"])
            html = render_email_html(**{k: content[k] for k in ("subject", "body", "offer_details", "call_to_action", "image_url")},
                                     recipient_name="John")
            return {"html": html, **content}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Preview error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate preview")

@app.post("/emails/{post_id}/render")
async def render_email_for_send(post_id: int):
    try:
        async with app.state.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT caption, image_urls FROM posts WHERE id = $1", post_id)
            if not row:
                raise HTTPException(status_code=404, detail="Post not found")
            content = parse_post_content(row["caption"], row["image_urls"])
            html = render_email_html(**{k: content[k] for k in ("subject", "body", "offer_details", "call_to_action", "image_url")})
            return {"html": html, "subject": content["subject"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Render error: {e}")
        raise HTTPException(status_code=500, detail="Failed to render email")

# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------
@app.post("/campaigns/{campaign_id}/leads/upload")
async def upload_leads_csv(campaign_id: int, file: UploadFile = File(...)):
    import csv, io
    try:
        content = await file.read()
        reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
        if "email" not in (reader.fieldnames or []):
            raise HTTPException(status_code=400, detail="CSV must have an 'email' column")
        added = errors = 0
        async with app.state.pool.acquire() as conn:
            for row in reader:
                email = row.get("email")
                if not email:
                    continue
                try:
                    await conn.execute("""
                        INSERT INTO leads (campaign_id, email, name, status)
                        VALUES ($1, $2, $3, 'PENDING')
                        ON CONFLICT (campaign_id, email) DO NOTHING
                    """, campaign_id, email, row.get("name"))
                    added += 1
                except Exception as e:
                    logger.error(f"Error adding lead {email}: {e}")
                    errors += 1
        return {"message": "CSV processed", "added": added, "errors": errors}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CSV upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process CSV: {e}")

@app.get("/campaigns/{campaign_id}/leads", response_model=List[LeadResponse])
async def get_campaign_leads(campaign_id: int):
    try:
        async with app.state.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, email, name, status, sent_at
                FROM leads WHERE campaign_id = $1 ORDER BY created_at DESC
            """, campaign_id)
            return rows
    except Exception as e:
        logger.error(f"Error fetching leads: {e}")
        raise HTTPException(status_code=500)

@app.post("/campaigns/{campaign_id}/leads", response_model=LeadResponse)
async def add_campaign_lead(campaign_id: int, lead: LeadCreate):
    try:
        async with app.state.pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO leads (campaign_id, email, name, status)
                VALUES ($1, $2, $3, 'PENDING')
                ON CONFLICT (campaign_id, email)
                DO UPDATE SET name = COALESCE(excluded.name, leads.name)
                RETURNING id, email, name, status, sent_at
            """, campaign_id, lead.email, lead.name)
            return row
    except Exception as e:
        logger.error(f"Error adding lead: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# Email sending
# ---------------------------------------------------------------------------
@app.post("/campaigns/{campaign_id}/send")
async def send_campaign_emails(campaign_id: int, request: SendCampaignRequest,
                                background_tasks: BackgroundTasks):
    try:
        async with app.state.pool.acquire() as conn:
            leads = await conn.fetch("SELECT id, email, name FROM leads WHERE campaign_id = $1", campaign_id)
            if not leads:
                return {"message": "No leads found for this campaign."}
            caption_data = json.dumps({"subject": request.subject, "body": request.body_template})
            await conn.execute("""
                INSERT INTO posts (campaign_id, caption, status, scheduled_at, created_at, updated_at)
                VALUES ($1, $2, 'PUBLISHED', datetime('now'), datetime('now'), datetime('now'))
            """, campaign_id, caption_data)
            background_tasks.add_task(
                process_email_sending, campaign_id,
                [dict(l) for l in leads], request.subject, request.body_template
            )
            return {"message": f"Sending started for {len(leads)} leads", "count": len(leads)}
    except Exception as e:
        logger.error(f"Error triggering send: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _resolve_image_path(image_url: str) -> Optional[Path]:
    """Convert a hosted image URL (local server) to its absolute on-disk Path."""
    from urllib.parse import urlparse
    path = urlparse(image_url).path
    # Use APP_DIR as absolute base so this works regardless of CWD
    if path.startswith("/images/"):
        return APP_DIR / "generated_images" / path.removeprefix("/images/")
    if path.startswith("/uploads/"):
        return APP_DIR / "uploads" / path.removeprefix("/uploads/")
    return None


import re as _re

def _prepare_email_images(body_html: str):
    """
    For each local <img src="http://localhost/...">:
      1. Upload to Zoho with ?isInline=true  → Zoho returns a hosted 'url'
      2. Replace src with that hosted url so the image renders in the email.
    Falls back to base64 data URI if the Zoho upload fails.
    Returns (processed_html, attachments_list).
    attachments_list is always empty because inline images go via the hosted url,
    not via the send-API attachments array.
    """
    import base64, mimetypes
    from backend.email_service import email_service

    processed = body_html

    for url in _re.findall(r'src="([^"]+)"', body_html, _re.IGNORECASE):
        if "localhost" not in url and "127.0.0.1" not in url:
            continue
        file_path = _resolve_image_path(url)
        if not file_path or not file_path.exists():
            logger.warning(f"[images] file not found for {url} → {file_path}")
            processed = processed.replace(f'src="{url}"', 'src="" style="display:none"', 1)
            continue

        # Upload to Zoho with isInline=true → get hosted url
        try:
            data = email_service.upload_zoho_attachment(file_path, inline=True)
            hosted_url = data.get("url", "")
            if hosted_url:
                processed = processed.replace(f'src="{url}"', f'src="{hosted_url}"', 1)
                logger.info(f"[images] uploaded {file_path.name} → {hosted_url}")
                continue
            else:
                logger.warning(f"[images] Zoho upload returned no url for {file_path.name}, data={data}")
        except Exception as e:
            logger.warning(f"[images] Zoho upload failed for {file_path.name}, falling back to base64: {e}")

        # Fallback: base64 data URI
        try:
            mime, _ = mimetypes.guess_type(str(file_path))
            mime = mime or "image/png"
            b64 = base64.b64encode(file_path.read_bytes()).decode("utf-8")
            processed = processed.replace(f'src="{url}"', f'src="data:{mime};base64,{b64}"', 1)
            logger.info(f"[images] base64-embedded {file_path.name} ({len(b64)//1024}KB)")
        except Exception as e:
            logger.warning(f"[images] could not embed {url}: {e}")

    return processed, []


async def process_email_sending(_campaign_id: int, leads: List[dict], subject: str,
                                 body_html: str):
    """
    Flujo:
    1. Subir imágenes locales a Zoho (inline attachment con CID).
    2. Enviar el email personalizado a cada lead via Zoho API.
    """
    from backend.email_service import email_service

    processed_html, attachments = _prepare_email_images(body_html)

    async with app.state.pool.acquire() as conn:
        for lead in leads:
            try:
                body = processed_html.replace("{{name}}", lead.get("name") or "there")
                body = body.replace("{{email}}", lead.get("email") or "")
                await email_service.send_email(lead["email"], subject, body, attachments=attachments)
                await conn.execute("UPDATE leads SET status = 'SENT', sent_at = datetime('now') WHERE id = $1",
                                   lead["id"])
                logger.info(f"Email sent to {lead['email']}")
            except Exception as e:
                logger.error(f"Failed to send to {lead['email']}: {e}")
                await conn.execute("UPDATE leads SET status = 'FAILED' WHERE id = $1", lead["id"])

# ---------------------------------------------------------------------------
# Cron scheduler
# ---------------------------------------------------------------------------
async def cron_loop():
    import asyncio
    await asyncio.sleep(10)
    while True:
        try:
            if hasattr(app.state, "pool") and app.state.pool:
                async with app.state.pool.acquire() as conn:
                    posts = await conn.fetch("""
                        SELECT id, campaign_id, caption, image_urls
                        FROM posts
                        WHERE status = 'APPROVED'
                          AND scheduled_at IS NOT NULL
                          AND scheduled_at <= datetime('now')
                    """)
                    for post in posts:
                        try:
                            content = parse_post_content(post["caption"], post["image_urls"])
                            html = render_email_html(
                                subject=content["subject"], body=content["body"],
                                offer_details=content["offer_details"],
                                call_to_action=content["call_to_action"],
                                image_url=content["image_url"]
                            )
                            leads = await conn.fetch(
                                "SELECT id, email, name FROM leads WHERE campaign_id = $1",
                                post["campaign_id"]
                            )
                            if leads:
                                import asyncio as _asyncio
                                _asyncio.create_task(
                                    process_email_sending(post["campaign_id"], [dict(l) for l in leads],
                                                          content["subject"], html)
                                )
                                logger.info(f"[Cron] Triggered post {post['id']} → {len(leads)} leads")
                            await conn.execute("UPDATE posts SET status = 'PUBLISHED' WHERE id = $1", post["id"])
                        except Exception as e:
                            logger.error(f"[Cron] Error on post {post['id']}: {e}")
        except Exception as e:
            logger.error(f"Cron loop error: {e}")
        import asyncio
        await asyncio.sleep(60)

# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------
from fastapi.responses import RedirectResponse


def _build_oauth_flow(redirect_uri: str):
    email_service.get_zoho_creds()


@app.get("/auth/zoho/login")
async def login_zoho():
    url = await email_service.get_zoho_creds()
    return {"url":url}


@app.get("/auth/zoho/callback")
async def callback_zoho(code: str):
    params = {
        "code": code,
        "grant_type": "authorization_code",
        "client_id": os.getenv("ZOHO_CLIENT_ID"),
        "client_secret": os.getenv("ZOHO_CLIENT_SECRET"),
        "redirect_uri": email_service.redirect_uri,
        "scope": "ZohoMail.messages.CREATE,ZohoMail.accounts.READ"
    }
    token_url = f"https://accounts.zoho.com/oauth/v2/token?{urlencode(params)}"
    response = requests.post(url=token_url)
    response_dict = response.json()

    access_token = response_dict.get("access_token", "")
    refresh_token = response_dict.get("refresh_token", "")
    print(f"Zoho refresh token: {refresh_token}")

    if not access_token:
        logger.error(f"Zoho token exchange failed: {response_dict}")
        from fastapi.responses import RedirectResponse
        return RedirectResponse("http://localhost:5173/?error=zoho_token_failed")

    os.environ["ZOHO_ACCESS_TOKEN"] = access_token
    if refresh_token:
        os.environ["ZOHO_REFRESH_TOKEN"] = refresh_token

    # Fetch the account ID and save everything to config so it persists across restarts
    account_id = email_service.getZohoAccountID()
    cfg = load_config()
    if refresh_token:
        cfg["zoho_refresh_token"] = refresh_token
    if account_id:
        cfg["zoho_account_id"] = account_id
    save_config(cfg)
    inject_into_env(cfg)

    from fastapi.responses import RedirectResponse
    return RedirectResponse("http://localhost:5173/?connected=true")

@app.get("/auth/status")
async def auth_status():
    try:
        import aiosqlite
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute(
                "SELECT user_email FROM gmail_credentials ORDER BY created_at DESC LIMIT 1"
            ) as cur:
                row = await cur.fetchone()
        if row:
            return {"connected": True, "email": row[0], "method": "oauth"}
        # Fall back: SMTP credentials count as connected
        smtp_user = os.getenv("GMAIL_USER")
        if smtp_user and os.getenv("GMAIL_APP_PASSWORD"):
            return {"connected": True, "email": smtp_user, "method": "smtp"}
        return {"connected": False, "email": None}
    except Exception as e:
        logger.error(f"Auth status check failed: {e}")
        return {"connected": False, "email": None}

# ---------------------------------------------------------------------------
# Serve React frontend (must be last — catches all unmatched routes)
# ---------------------------------------------------------------------------
_frontend_dist = Path(__file__).parent.parent / "apps" / "dashboard" / "dist"

if _frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="frontend_assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):  # noqa: ARG001
        return FileResponse(str(_frontend_dist / "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "Email Automation API is running. Frontend not built yet."}
