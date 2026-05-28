"""FastAPI 路由定义。

本文件是应用入口壳，负责：
- 创建 FastAPI app 实例
- 注册请求日志中间件
- 挂载静态文件
- 包含所有业务路由（从 routers/ 模块导入）
- SPA catch-all 回退
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from utils.logger import get_logger as _get_req_logger, setup_file_logging
from config import LOG_DIR

# 初始化文件日志
setup_file_logging(LOG_DIR)

app = FastAPI(title="图文工坊")
_req_logger = _get_req_logger("api")


# ── 请求日志中间件 ──────────────────────────────────────

@app.middleware("http")
async def _log_requests(request, call_next):
    start = time.time()
    response = await call_next(request)
    cost = time.time() - start
    if request.url.path.startswith("/api/"):
        _req_logger.info("%s %s → %s (%.0fms)", request.method, request.url.path, response.status_code, cost * 1000)
    return response


# ── Toast 日志写入 ──────────────────────────────────────

class ToastLogRequest(BaseModel):
    message: str
    type: str = "info"

@app.post("/api/logs/toast")
async def log_toast(req: ToastLogRequest):
    _req_logger.info("[TOAST/%s] %s", req.type, req.message)
    return {"success": True}


# ── 静态文件 ───────────────────────────────────────────

import sys as _sys

def _resolve_static_dir() -> Path:
    meipass = getattr(_sys, '_MEIPASS', None)
    candidates = []
    if meipass:
        meipass = Path(meipass)
        candidates.extend([
            meipass / 'desktop' / 'static',
            meipass / 'static',
            meipass / '_internal' / 'desktop' / 'static',
            meipass / '_internal' / 'static',
        ])
    candidates.append(Path(__file__).parent / 'static')
    project_root = Path(__file__).resolve().parent.parent
    candidates.append(project_root / 'dist' / project_root.name / '_internal' / 'desktop' / 'static')

    for c in candidates:
        try:
            if c.exists():
                return c
        except Exception:
            continue
    return Path(__file__).parent / 'static'


STATIC_DIR = _resolve_static_dir()
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

_assets_dir = STATIC_DIR / "assets"
if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

_js_dir = STATIC_DIR / "js"
if _js_dir.exists():
    app.mount("/js", StaticFiles(directory=str(_js_dir)), name="js")

_vendor_dir = STATIC_DIR / "vendor"
if _vendor_dir.exists():
    app.mount("/vendor", StaticFiles(directory=str(_vendor_dir)), name="vendor")


# ── 首页 ──────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = STATIC_DIR / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


# ── 注册业务路由 ──────────────────────────────────────

from desktop.routers import api_router
app.include_router(api_router)


# ── SPA Catch-All（放在所有路由最后）─────────────────

@app.get("/{full_path:path}", response_class=HTMLResponse, include_in_schema=False)
async def spa_fallback(full_path: str):
    """React SPA 路由回退：所有非 API 路径返回 index.html。"""
    html_path = STATIC_DIR / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))
