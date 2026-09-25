"""Local serving with uvicorn. The Worker's entry point is src/worker.py."""

from __future__ import annotations

import logging

from fastapi.staticfiles import StaticFiles

from .factory import create_app
from .mcp.views import LOCAL_ASSETS, VIEWS_PATH
from .settings import get_settings

logging.basicConfig(format="%(levelname)s | %(name)s | %(message)s")

app = create_app()
# A Worker serves its assets before the app runs; locally the app serves them.
app.mount(
    f"/{VIEWS_PATH}",
    StaticFiles(directory=LOCAL_ASSETS / VIEWS_PATH, check_dir=False),
)


def main() -> None:
    """Starting uvicorn directly ignores HOST, PORT and UVICORN_RELOAD."""
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.uvicorn_reload,
    )
