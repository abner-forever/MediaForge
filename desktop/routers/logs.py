"""日志与反馈 API 路由。"""

from __future__ import annotations

import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query

from config import LOG_DIR

router = APIRouter(tags=["logs"])


@router.get("/api/logs/list")
async def list_log_files():
    """列出所有可用的日志文件（app.log, crash.log, runs/*.jsonl）。"""
    files = []

    # 主日志文件 app.log（含备份）
    for f in sorted(LOG_DIR.glob("app.log*"), reverse=True):
        files.append({
            "name": f.name,
            "size": f.stat().st_size,
            "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        })

    # 崩溃日志
    crash = LOG_DIR / "crash.log"
    if crash.exists():
        files.append({
            "name": "crash.log",
            "size": crash.stat().st_size,
            "mtime": datetime.fromtimestamp(crash.stat().st_mtime).isoformat(),
        })

    # 运行审计日志（最近 10 个）
    runs_dir = LOG_DIR / "runs"
    if runs_dir.exists():
        for f in sorted(runs_dir.glob("*.jsonl"), reverse=True)[:10]:
            files.append({
                "name": f"runs/{f.name}",
                "size": f.stat().st_size,
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })

    return {"files": files}


@router.get("/api/logs/content")
async def get_log_content(file: str = Query(...), max_lines: int = Query(500)):
    """读取指定日志文件内容，默认最多 500 行。

    安全限制：文件路径必须位于 LOG_DIR 下，防止目录穿越。
    """
    safe_path = (LOG_DIR / file).resolve()
    if not str(safe_path).startswith(str(LOG_DIR.resolve())):
        raise HTTPException(403, "不允许访问该路径")
    if not safe_path.exists() or not safe_path.is_file():
        raise HTTPException(404, "日志文件不存在")
    if safe_path.stat().st_size > 50 * 1024 * 1024:
        raise HTTPException(413, "日志文件过大（超过 50MB）")

    lines = safe_path.read_text(encoding="utf-8").splitlines()
    total = len(lines)
    if max_lines > 0 and total > max_lines:
        lines = lines[-max_lines:]
    return {"name": file, "lines": lines, "total": total}


@router.post("/api/logs/clipboard")
async def copy_log_to_clipboard(req: Dict[str, Any]):
    """将日志内容复制到系统剪贴板。"""
    text = (req.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "内容为空")

    try:
        _copy_to_clipboard(text)
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, f"复制到系统剪贴板失败: {e}")


@router.post("/api/logs/save-to-downloads")
async def save_log_to_downloads(req: Dict[str, Any]):
    """将日志文件保存到系统下载目录。"""
    file = (req.get("file") or "").strip()
    if not file:
        raise HTTPException(400, "缺少文件名")

    safe_path = (LOG_DIR / file).resolve()
    if not str(safe_path).startswith(str(LOG_DIR.resolve())):
        raise HTTPException(403, "不允许访问该路径")
    if not safe_path.exists() or not safe_path.is_file():
        raise HTTPException(404, "日志文件不存在")

    downloads = Path.home() / "Downloads"
    downloads.mkdir(parents=True, exist_ok=True)

    dest = downloads / safe_path.name
    counter = 1
    while dest.exists():
        stem = safe_path.stem
        suffix = safe_path.suffix
        dest = downloads / f"{stem}_{counter}{suffix}"
        counter += 1

    shutil.copy2(str(safe_path), str(dest))
    return {"success": True, "path": str(dest)}


def _copy_to_clipboard(text: str) -> None:
    """跨平台写入系统剪贴板。"""
    try:
        if sys.platform == "darwin":
            proc = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE)
            proc.communicate(input=text.encode("utf-8"))
        elif sys.platform == "win32":
            proc = subprocess.Popen(["clip"], stdin=subprocess.PIPE)
            proc.communicate(input=text.encode("utf-8"))
        else:
            try:
                proc = subprocess.Popen(["xclip", "-selection", "clipboard"], stdin=subprocess.PIPE)
                proc.communicate(input=text.encode("utf-8"))
            except FileNotFoundError:
                proc = subprocess.Popen(["xsel", "--clipboard", "--input"], stdin=subprocess.PIPE)
                proc.communicate(input=text.encode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"剪贴板写入失败: {e}")
