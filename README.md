# 🚀 Vision Media 1.0 - Content Engine

**Version de Vision Media para Zoho**

Designed to scale brand strategies by generating, scheduling, and publishing multi-format content (Posts, Stories, Reels) with zero friction.

![Dashboard Preview](https://via.placeholder.com/1200x600?text=Dashboard+Preview+Coming+Soon)

## ⚡ Key Features

- **Multi-Format Generation**: Create **Feed Posts**, **Stories**, and **Reels** tailored to your campaign strategy.
- **Visual Campaign Management**: Organize content into strategic campaigns with a clean, React-based dashboard.
- **AI-Driven Creativity**: Uses LLMs (Gemini/GPT) to generate captions and image prompts based on a Master Strategy.
- **Modular Integration**:

- **Cloud-Ready**: Fully containerized with Docker for easy deployment (AWS, DigitalOcean, etc.).

## 🛠️ Tech Stack

- **Backend**: Python (FastAPI), AsyncPG, Pydantic.
- **Frontend**: React, Vite, TailwindCSS, Lucide Icons.
- **Database**: PostgreSQL (Store posts, campaigns, and tokens).
- **Infrastucture**: Docker & Docker Compose.

## 🚀 Getting Started

### Prerequisites
- Docker & Docker Compose installed.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/affilalab/VisionMediaEmail-Zoho.git
   cd Instagram-automation-AI-generated-content
   ```

2. **Configure Environment**
   Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```
   *Required keys: `GEMINI_API_KEY`, `DATABASE_URL` (if external), `API_SECRET_KEY`.*

3. **Run the Project**
   The easiest way to run both backend and frontend is using the unified start script:
   ```bash
   ./start.sh
   ```
   This script allows you to choose between running with **Docker** (recommended) or **Locally**.

### Access the App
- **Dashboard**: `http://localhost:5173`
- **API Docs**: `http://localhost:8000/docs`

## 🧩 Architecture

The system follows a **Clean Architecture** approach:

- **Background Tasks**: Content generation happens asynchronously to keep the UI snappy.
- **Social Adapters**: `backend/social_adapter.py` allows switching between social providers without changing business logic.
- **Migration System**: Custom Python scripts ensure the database schema evolves safely.

## 🔮 Roadmap

- [ ] Video Generation for Reels (using Runway/Luma).
- [ ] Analytics Dashboard (Likes, Impressions).
- [ ] Multi-Tenant Support for Agencies.
- [ ] CI/CD Pipeline Integration.

---
*Built with ❤️ by Vision Media Team.*
