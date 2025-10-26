import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    HTMLResponse,
    FileResponse,
    JSONResponse as FastAPIJSONResponse,
)
from fastapi.staticfiles import StaticFiles

from .ipy_runner import IPythonRunner


class CustomJSONResponse(FastAPIJSONResponse):
    def render(self, content: Any) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            default=repr,
        ).encode("utf-8")


BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
NOTEBOOK_DIR = BASE_DIR / "notebooks"
NOTEBOOK_DIR.mkdir(parents=True, exist_ok=True)
SCRIPTS_DIR = BASE_DIR / "scripts"
SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("web_notebook")
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)

app = FastAPI(title="Jupyter-ish", version="1.0.0")

# CORS (same-host expected, but allow localhost usage)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

runner = IPythonRunner()

# Whitelisted filesystem roots for /fs serving (read-only)
ALLOWED_FS_ROOTS: List[Path] = [
    Path("/srv/samba/shared/bg_convert").resolve(),
]


def _is_allowed_path(p: Path) -> bool:
    try:
        rp = p.resolve()
    except Exception:
        return False
    for root in ALLOWED_FS_ROOTS:
        try:
            if root in rp.parents or rp == root:
                return True
        except Exception:
            continue
    return False


def _guess_media_type(path: Path) -> str:
    import mimetypes

    mt, _ = mimetypes.guess_type(str(path))
    return mt or "application/octet-stream"


@app.get("/", response_class=HTMLResponse)
def index() -> Any:
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=500, detail="index.html not found")
    return index_path.read_text(encoding="utf-8")


@app.post("/execute")
async def execute(payload: Dict[str, Any]) -> CustomJSONResponse:
    code = payload.get("code", "")
    cell_id = payload.get("cell_id")
    if not isinstance(code, str):
        raise HTTPException(status_code=400, detail="Invalid code payload")
    logger.info("Executing cell %s", cell_id)
    res = runner.run_code(code)
    logger.info("Execution done: err=%s", bool(res.get("error")))
    return CustomJSONResponse({"cell_id": cell_id, **res})


def _timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


@app.post("/save")
async def save_notebook(payload: Dict[str, Any]) -> FastAPIJSONResponse:
    cells: List[Dict[str, Any]] = payload.get("cells", [])
    if not isinstance(cells, list):
        raise HTTPException(status_code=400, detail="Invalid cells")
    raw_name = payload.get("name") or ""
    if not isinstance(raw_name, str):
        raw_name = ""
    safe = "".join(
        ch if (ch.isalnum() or ch in ".-_") else "_" for ch in raw_name
    ).strip("._-")
    ts = _timestamp()
    fname = (f"{safe}_" if safe else "") + f"{ts}.notebook"
    target = NOTEBOOK_DIR / fname
    doc = {
        "created_at": ts,
        "app_version": app.version,
        "cells": cells,
    }
    target.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Saved notebook: %s", target)
    return FastAPIJSONResponse({"saved": True, "filename": fname, "path": str(target)})


@app.post("/export_script")
async def export_script(payload: Dict[str, Any]) -> FastAPIJSONResponse:
    content = payload.get("content", "")
    if not isinstance(content, str):
        raise HTTPException(status_code=400, detail="Invalid content")
    raw_name = payload.get("name") or ""
    if not isinstance(raw_name, str):
        raw_name = ""
    safe = "".join(
        ch if (ch.isalnum() or ch in ".-_") else "_" for ch in raw_name
    ).strip("._-")
    ts = _timestamp()
    fname = (f"{safe}_" if safe else "") + f"{ts}.py"
    target = SCRIPTS_DIR / fname
    try:
        target.write_text(content, encoding="utf-8")
    except Exception as ex:
        logger.exception("Failed to save script: %s", ex)
        raise HTTPException(status_code=500, detail=str(ex))
    logger.info("Saved script: %s", target)
    return FastAPIJSONResponse({"saved": True, "filename": fname, "path": str(target)})


@app.get("/list")
async def list_notebooks() -> FastAPIJSONResponse:
    files = sorted([p.name for p in NOTEBOOK_DIR.glob("*.notebook")])
    return FastAPIJSONResponse({"files": files})


@app.get("/load")
async def load_notebook(file: str) -> FastAPIJSONResponse:
    if not file.endswith(".notebook"):
        raise HTTPException(status_code=400, detail="file must end with .notebook")
    path = NOTEBOOK_DIR / file
    if not path.exists():
        raise HTTPException(status_code=404, detail="not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return FastAPIJSONResponse(data)
    except Exception as ex:
        logger.exception("Failed to load notebook: %s", file)
        raise HTTPException(status_code=500, detail=str(ex))


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error: %s %s", request.url.path, exc)
    return FastAPIJSONResponse(status_code=500, content={"detail": str(exc)})


# --- Read-only file serving from whitelisted roots ---
@app.get("/fs")
async def get_fs_file_query(path: str, download: Optional[bool] = False):
    if not path:
        raise HTTPException(status_code=400, detail="Missing 'path'")
    target = Path(path)
    if not target.is_absolute():
        target = Path("/") / target
    if not _is_allowed_path(target):
        raise HTTPException(status_code=403, detail="Access denied")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    media = _guess_media_type(target)
    return FileResponse(
        path=str(target), filename=target.name if download else None, media_type=media
    )


@app.get("/fs/{path_param:path}")
async def get_fs_file_path(path_param: str, download: Optional[bool] = False):
    target = Path("/") / path_param
    if not _is_allowed_path(target):
        raise HTTPException(status_code=403, detail="Access denied")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    media = _guess_media_type(target)
    return FileResponse(
        path=str(target), filename=target.name if download else None, media_type=media
    )
