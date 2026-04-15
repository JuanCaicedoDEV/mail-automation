"""
Desktop launcher — starts the FastAPI server and opens the browser.
This file is the PyInstaller entry point.

On macOS: runs as a menu-bar app (rumps) so macOS keeps it alive properly.
On Windows/Linux: starts server and browser directly.
"""
import sys
import os
import threading
import time
import webbrowser
import logging
from pathlib import Path

# When bundled without a console (PyInstaller console=False), sys.stdout and
# sys.stderr are None. Uvicorn's logging formatter calls .isatty() on them and
# crashes. Redirect both to the log file before anything else touches them.
if sys.platform == "darwin":
    _log_dir = Path.home() / "Library" / "Logs"
elif sys.platform == "win32":
    _log_dir = Path(os.environ.get("APPDATA", str(Path.home()))) / "EmailAutomation" / "Logs"
else:
    _log_dir = Path.home() / ".emailautomation" / "logs"
_log_dir.mkdir(parents=True, exist_ok=True)

_log_file = open(str(_log_dir / "EmailAutomation.log"), "a", encoding="utf-8", buffering=1)
if sys.stdout is None:
    sys.stdout = _log_file
if sys.stderr is None:
    sys.stderr = _log_file

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(str(_log_dir / "EmailAutomation.log"), encoding="utf-8"),
        logging.StreamHandler(sys.stderr),
    ]
)
logger = logging.getLogger("launcher")


def _fix_paths():
    """When running as a PyInstaller bundle, add the bundle root to sys.path."""
    if hasattr(sys, "_MEIPASS"):
        bundle_dir = sys._MEIPASS
        logger.info(f"Running from bundle: {bundle_dir}")
        if bundle_dir not in sys.path:
            sys.path.insert(0, bundle_dir)
    else:
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        logger.info(f"Running from source: {project_root}")
        if project_root not in sys.path:
            sys.path.insert(0, project_root)


def _start_server():
    """Start uvicorn in this thread (blocks until quit)."""
    import uvicorn
    logger.info("Starting uvicorn on 127.0.0.1:8000")
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        # Disable uvicorn's default log config — it calls isatty() on
        # sys.stderr which is None when running without a console window.
        log_config=None,
    )


def _open_browser_delayed():
    time.sleep(3.0)
    logger.info("Opening browser at http://127.0.0.1:8000")
    webbrowser.open("http://127.0.0.1:8000")


# ── macOS: menu-bar app ───────────────────────────────────────────────────────

def _run_macos():
    """Run as a proper macOS menu-bar app using rumps."""
    import rumps

    class EmailAutomationApp(rumps.App):
        def __init__(self):
            super().__init__("Email Automation", icon=None, quit_button=None)
            self.menu = [
                rumps.MenuItem("Open Dashboard", callback=self._open_dashboard),
                None,  # separator
                rumps.MenuItem("Quit", callback=self._quit),
            ]

        def _open_dashboard(self, _):
            webbrowser.open("http://127.0.0.1:8000")

        def _quit(self, _):
            logger.info("Quit requested from menu bar")
            rumps.quit_application()

    # Start server in a background thread
    server_thread = threading.Thread(target=_start_server, daemon=True)
    server_thread.start()

    # Open browser after a short delay
    browser_thread = threading.Thread(target=_open_browser_delayed, daemon=True)
    browser_thread.start()

    # Run the rumps event loop (keeps macOS happy — shows icon in menu bar)
    EmailAutomationApp().run()


# ── Windows / Linux ───────────────────────────────────────────────────────────

def _run_other():
    browser_thread = threading.Thread(target=_open_browser_delayed, daemon=True)
    browser_thread.start()
    _start_server()  # blocks


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    logger.info(f"Launcher starting — Python {sys.version}, platform {sys.platform}")
    logger.info(f"sys.executable: {sys.executable}")
    logger.info(f"cwd: {os.getcwd()}")

    try:
        _fix_paths()

        if sys.platform == "darwin":
            _run_macos()
        else:
            _run_other()

    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        raise


if __name__ == "__main__":
    main()
