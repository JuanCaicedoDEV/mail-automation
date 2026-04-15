# Content Automation Engine - Blueprint

## Objetivo
Sustituir el flujo de n8n por un sistema autónomo que audita marcas, genera contenido visual/escrito y gestiona aprobaciones mediante un Dashboard propio.

## Arquitectura de Sistema
1. **Scraper Service:** Python (Playwright/BeautifulSoup) para analizar identidades de marca.
2. **AI Engine:** Integración con Gemini 3 Pro (Nano Banana) para generación de imágenes y texto.
3. **Database:** PostgreSQL para sustituir Google Sheets (Persistencia de estados de post).
4. **Dashboard:** React (Vite) para el "Review & Approve" que antes hacías en el Sheet.
5. **Cloud Stack:** Dockerizado para despliegue en GCP (Cloud Run) o DigitalOcean.

## Mapeo de Lógica n8n -> Full Code
- **n8n Google Sheets:** Sustituido por tabla `posts` en Postgres.
- **n8n Scrape Website:** Sustituido por `execution/scraper.py`.
- **n8n AI Image Gen:** Sustituido por `execution/generator.py` (API de Google AI).
- **n8n Gmail Approval:** Sustituido por la UI del Dashboard (Botones de Aprobar).