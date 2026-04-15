# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Email Automation desktop app.
Produces EmailAutomation.app (Mac) or EmailAutomation.exe (Windows).
"""

import sys
from pathlib import Path

block_cipher = None

PROJECT_ROOT = str(Path(SPECPATH).parent)  # noqa: F821 — SPECPATH is injected by PyInstaller

a = Analysis(
    [str(Path(PROJECT_ROOT) / "build" / "launcher.py")],
    pathex=[PROJECT_ROOT],
    binaries=[],
    datas=[
        # Bundle the built React frontend
        (str(Path(PROJECT_ROOT) / "apps" / "dashboard" / "dist"), "apps/dashboard/dist"),
        # Bundle the AI execution modules
        (str(Path(PROJECT_ROOT) / "execution"), "execution"),
        # Bundle the backend package (non-py files if any)
        (str(Path(PROJECT_ROOT) / "backend"), "backend"),
    ],
    hiddenimports=[
        # FastAPI / Starlette / Uvicorn internals
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "fastapi",
        "starlette",
        "starlette.staticfiles",
        "starlette.responses",
        # Database
        "aiosqlite",
        # Google APIs
        "google.genai",
        "google_auth_oauthlib",
        "google_auth_oauthlib.flow",
        "googleapiclient",
        "googleapiclient.discovery",
        "google.auth.transport.requests",
        "google.oauth2.credentials",
        # Image processing
        "PIL",
        "PIL.Image",
        # HTTP
        "httpx",
        "httpx._transports.default",
        # Email
        "email",
        "smtplib",
        # Pydantic
        "pydantic",
        "pydantic.v1",
        # APScheduler (uses dynamic plugin imports PyInstaller won't auto-detect)
        "apscheduler",
        "apscheduler.schedulers",
        "apscheduler.schedulers.asyncio",
        "apscheduler.executors",
        "apscheduler.executors.asyncio",
        "apscheduler.executors.base",
        "apscheduler.jobstores.base",
        "apscheduler.jobstores.memory",
        # App modules
        "backend.main",
        "backend.database",
        "backend.config_manager",
        "backend.email_service",
        "backend.storage",
        "execution.generator",
        "execution.scraper",
        # macOS menu-bar
        "rumps",
        "objc",
        "AppKit",
        "Foundation",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=["asyncpg", "supabase", "sqlalchemy", "docker", "pytest"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)  # noqa: F821

exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="EmailAutomation",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # rumps runs the NSApplication loop; no terminal window needed
    icon=None,      # Set to .icns (Mac) or .ico (Windows) if you have one
)

coll = COLLECT(  # noqa: F821
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="EmailAutomation",
)

# Mac-only: wrap the collected dir into a .app bundle
if sys.platform == "darwin":
    app = BUNDLE(  # noqa: F821
        coll,
        name="EmailAutomation.app",
        icon=None,
        bundle_identifier="com.emailautomation.desktop",
        info_plist={
            "NSHighResolutionCapable": True,
            "CFBundleShortVersionString": "1.0.0",
        },
    )
