# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vision Media Email Automation — an AI-driven email marketing platform integrated with Zoho Mail. Users create brands (with AI-generated DNA), build campaigns, generate email content via Gemini, manage leads, and send bulk emails through Zoho Mail's API.

## Running the Project

**Recommended (Docker):**
```bash
./start.sh   # choose option 1 — Docker
```

**Local development:**
```bash
./start.sh   # choose option 2 — sets up .venv, installs deps, starts both servers
```

Or manually:
```bash
# Backend (from project root)
source .venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# Frontend (in a second terminal)
cd apps/dashboard
npm run dev
```

- Dashboard: `http://localhost:5173`
- API docs (Swagger): `http://localhost:8000/docs`

**Frontend commands (from `apps/dashboard/`):**
```bash
npm run dev       # dev server
npm run build     # production build (output goes to apps/dashboard/dist/)
npm run lint      # ESLint
npm run preview   # preview production build
```

## Key Environment Variables

Stored in `.env` at project root (copy from `.env.example`). At runtime, these are also persisted to `~/Library/Application Support/EmailAutomation/config.json` (macOS) via the Settings screen.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Required — powers all AI content generation |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | Zoho OAuth app credentials |
| `ZOHO_REFRESH_TOKEN` | Long-lived token; obtained via `/auth/zoho/login` flow |
| `ZOHO_ACCOUNT_ID` | Zoho mailbox ID; auto-fetched on login |
| `ZOHO_EMAIL` | Sender address for Zoho API emails |
| `API_SECRET_KEY` | Protects external API requests (localhost is always exempt) |
| `STORAGE_PROVIDER` | `local` (default) or `supabase` |

## Architecture

### 3-Layer Design (per `General_Instructions.md`)
- **Directives** (`directives/`) — SOPs in Markdown defining goals and edge cases
- **Orchestration** — intelligent routing, error handling, directive updates
- **Execution** (`execution/`) — deterministic Python scripts: `scraper.py` (SSRF-safe URL fetching), `generator.py` (Gemini API calls)

### Backend (`backend/`)
- `main.py` — FastAPI app; all REST endpoints, email HTML rendering, cron loop, Zoho OAuth routes
- `database.py` — **SQLite wrapper** that mimics the asyncpg pool API (`Pool`, `Connection`). Translates `$1/$2` → `?` and `NOW()` → `datetime('now')` automatically. DB file lives at `APP_DIR/app.db`.
- `config_manager.py` — loads `.env` + `config.json` at startup; `inject_into_env()` pushes config into `os.environ` so all modules read env vars
- `email_service.py` — `EmailService` class: Zoho OAuth flow, `send_email()` via Zoho REST API, `upload_zoho_attachment()`, `get_access_token()` (refresh)
- `storage.py` — `LocalStorageProvider` (saves to `uploads/`) and optional `SupabaseStorageProvider`
- `APP_DIR` — `~/Library/Application Support/EmailAutomation/` on macOS; all persistent data lives here

### Startup sequence (`main.py`)
1. Load `config.json` → inject into env
2. `os.chdir(APP_DIR)` so all relative paths (`uploads/`, `generated_images/`) resolve correctly
3. APScheduler: refresh Zoho access token every hour
4. Create SQLite pool → run schema migrations
5. Launch `cron_loop()` — checks every 60s for APPROVED posts with past `scheduled_at`, triggers email sends

### Frontend (`apps/dashboard/src/`)
React 19 SPA with Vite + TailwindCSS v4. Main screens: `App.jsx` (router shell), `CalendarView.jsx`, `LeadsManager.jsx`, `PostDetailModal.jsx`, `SettingsScreen.jsx`, `SplashScreen.jsx`. API calls use `axios`.

### AI Models Used
- **Text/email content**: `gemini-2.5-flash` (via `google-genai` SDK)
- **Image generation**: `imagen-4.0-fast-generate-001`
- Rate limit handling: `retry_api_call()` in `generator.py` with exponential backoff (3 retries)

### Post lifecycle
`PENDING` → background task runs `process_post_generation()` → `APPROVED` (or `FAILED`). Cron loop picks up `APPROVED` posts with `scheduled_at ≤ now` → sends emails → `PUBLISHED`.

### Zoho OAuth flow
1. Call `GET /auth/zoho/login` → returns authorization URL
2. User visits URL, approves → Zoho redirects to `GET /auth/zoho/callback?code=...`
3. Callback exchanges code for tokens → saves `ZOHO_ACCESS_TOKEN` and fetches `ZOHO_ACCOUNT_ID`
4. APScheduler refreshes `ZOHO_ACCESS_TOKEN` every hour using `ZOHO_REFRESH_TOKEN`

### Desktop app packaging (`build/`)
PyInstaller + `rumps` (macOS menu bar). `build/launcher.py` is the entry point. Build scripts: `build/build_mac.sh`, `build/build_windows.bat`.

## Known Issues / WIP

- `process_email_sending()` in `main.py:748` contains incomplete/broken code (`pathImage = await.process_email_sending()`). The Zoho send flow for bulk campaign sends is not yet fully wired up.
- `docker-compose.yml` uses PostgreSQL, but the actual application runtime uses SQLite (`backend/database.py`). The Docker compose is not aligned with the current codebase.
- `_build_oauth_flow()` function in `main.py` is a stub (does nothing useful).
