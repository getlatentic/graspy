"""The MCP Apps views, built from apps/server/ui into the static assets: read
through the ASSETS binding on a Worker, from files locally."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

LOCAL_ASSETS = Path(__file__).resolve().parents[3] / "assets"
VIEWS_PATH = "views"


class ViewsMissing(RuntimeError):
    pass


class Views(Protocol):
    async def read(self, name: str) -> str: ...


class LocalViews:
    def __init__(self, assets: Path = LOCAL_ASSETS) -> None:
        self._directory = assets / VIEWS_PATH

    async def read(self, name: str) -> str:
        path = self._directory / name
        if not path.is_file():
            raise ViewsMissing(
                f"{path} is not built: run `npm run build` in apps/server/ui"
            )
        return path.read_text(encoding="utf-8")


class AssetViews:
    # The binding answers by path; the host is never resolved.
    ORIGIN = "https://assets.local"

    def __init__(self, binding: Any) -> None:
        self._binding = binding

    async def read(self, name: str) -> str:
        response = await self._binding.fetch(f"{self.ORIGIN}/{VIEWS_PATH}/{name}")
        if not response.ok:
            raise ViewsMissing(f"The Worker's assets have no {VIEWS_PATH}/{name}")
        return await response.text()
