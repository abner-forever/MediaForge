"""本地素材管理 API 路由。"""

from __future__ import annotations

import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DOWNLOAD_DIR
from desktop.app_state import app_state
from desktop.api_helpers import IMAGE_EXT, ScoreRequest, img_rel
from services.extensions import score_images_batch

router = APIRouter(tags=["materials"])


def _count_images(dir_path: Path) -> int:
    count = 0
    for f in dir_path.rglob("*"):
        if f.is_file() and f.suffix.lower() in IMAGE_EXT:
            count += 1
    return count


def _build_tree_node(dir_path: Path, root: Path) -> Optional[dict]:
    name = dir_path.name
    rel = dir_path.relative_to(root)
    rel_str = str(rel.as_posix())
    children: list[dict] = []
    files: list[dict] = []
    item_count = 0
    for child in sorted(dir_path.iterdir()):
        if child.name.startswith(".") or child.name == "__covers__":
            continue
        if child.is_dir():
            node = _build_tree_node(child, root)
            if node:
                children.append(node)
                item_count += node["item_count"]
        elif child.suffix.lower() in IMAGE_EXT:
            item_count += 1
            files.append({
                "name": child.name,
                "path": str(child.relative_to(root).as_posix()),
                "type": "file",
            })
    return {
        "name": name,
        "path": rel_str,
        "type": "folder",
        "item_count": item_count,
        "children": children,
        "files": files,
    }


def _build_breadcrumb(rel_path: Path) -> list[dict]:
    parts = list(rel_path.parts) if str(rel_path) != "." else []
    items = [{"name": "全部素材", "path": ""}]
    cur = ""
    for p in parts:
        cur = f"{cur}/{p}" if cur else p
        items.append({"name": p, "path": cur})
    return items


@router.get("/api/materials")
async def list_materials():
    """返回本地图片列表，按 celebrity/scene/post 三级分组。"""
    groups: Dict[str, Dict] = {}
    total_images = 0
    img_root = DOWNLOAD_DIR.expanduser().resolve()
    if not img_root.exists():
        return {"groups": [], "total_images": 0}

    for celeb_dir in sorted(img_root.iterdir()):
        if not celeb_dir.is_dir():
            continue
        if celeb_dir.name.startswith(".") or celeb_dir.name == "__covers__":
            continue
        celeb_name = celeb_dir.name
        celeb_group = {"celebrity": celeb_name, "scenes": [], "total": 0}
        for scene_dir in sorted(celeb_dir.iterdir()):
            if not scene_dir.is_dir():
                continue
            scene_name = scene_dir.name
            scene_data = {"scene": scene_name, "posts": [], "total": 0}
            for post_dir in sorted(scene_dir.iterdir()):
                if not post_dir.is_dir():
                    continue
                images = []
                for f in sorted(post_dir.iterdir()):
                    if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                        images.append(str(f))
                if images:
                    scene_data["posts"].append({"post_id": post_dir.name, "images": images})
                    scene_data["total"] += len(images)
                    total_images += len(images)
            if scene_data["posts"]:
                celeb_group["scenes"].append(scene_data)
                celeb_group["total"] += scene_data["total"]
        if celeb_group["scenes"]:
            groups[celeb_name] = celeb_group

    return {"groups": list(groups.values()), "total_images": total_images}


class MaterialsDeleteRequest(BaseModel):
    paths: List[str] = []


@router.delete("/api/materials")
async def delete_materials(req: MaterialsDeleteRequest):
    """删除指定图片文件并清理空目录。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    deleted = 0
    for p in req.paths:
        fp = (root / p).resolve()
        if not str(fp).startswith(str(root)):
            continue
        if fp.exists() and fp.is_file():
            fp.unlink()
            deleted += 1
            parent = fp.parent
            for _ in range(3):
                if parent == root or not parent.exists():
                    break
                try:
                    next(parent.iterdir())
                    break
                except StopIteration:
                    parent.rmdir()
                    parent = parent.parent
    return {"success": True, "deleted": deleted}


@router.get("/api/materials/tree")
async def materials_tree():
    """返回完整文件夹树结构。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    if not root.exists():
        return {"tree": []}
    tree: list[dict] = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith(".") or child.name == "__covers__":
            continue
        node = _build_tree_node(child, root)
        if node:
            tree.append(node)
    return {"tree": tree}


@router.get("/api/materials/browse")
async def materials_browse(path: str = Query("")):
    """浏览指定文件夹内容。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    if not root.exists():
        return {"folders": [], "files": [], "breadcrumb": _build_breadcrumb(Path("."))}

    target = (root / path).resolve() if path else root
    if not target.exists() or not target.is_dir():
        raise HTTPException(404, f"文件夹不存在: {path}")
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "路径越界")

    folders: list[dict] = []
    files: list[dict] = []
    for child in sorted(target.iterdir()):
        if child.name.startswith(".") or child.name == "__covers__":
            continue
        if child.is_dir():
            folders.append({
                "name": child.name,
                "path": child.relative_to(root).as_posix(),
                "type": "folder",
                "item_count": _count_images(child),
            })
        elif child.suffix.lower() in IMAGE_EXT:
            files.append({
                "name": child.name,
                "path": child.relative_to(root).as_posix(),
                "type": "file",
                "size": child.stat().st_size,
            })

    rel_path = target.relative_to(root)
    rel_path_str = str(rel_path.as_posix()) if str(rel_path) != "." else ""

    sort_order: list = app_state.get_folder_sort_order(rel_path_str)
    if sort_order:
        order_map = {name: i for i, name in enumerate(sort_order)}
        files.sort(key=lambda f: (order_map.get(f["name"], len(sort_order)), f["name"]))

    return {
        "folders": folders,
        "files": files,
        "breadcrumb": _build_breadcrumb(rel_path),
    }


class SortOrderRequest(BaseModel):
    path: str = ""
    order: list[str] = []


@router.put("/api/materials/sort-order")
async def materials_set_sort_order(req: SortOrderRequest):
    """保存文件夹内文件的自定义排序顺序。"""
    app_state.set_folder_sort_order(req.path, req.order)
    return {"success": True}


@router.get("/api/materials/sort-order")
async def materials_get_sort_order(path: str = Query("")):
    """获取文件夹内文件的自定义排序顺序。"""
    return {"path": path, "order": app_state.get_folder_sort_order(path)}


class FolderCreateRequest(BaseModel):
    parent_path: str = ""
    name: str = "新建文件夹"


@router.post("/api/materials/folder")
async def materials_create_folder(req: FolderCreateRequest):
    """在当前目录下创建子文件夹。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    parent = (root / req.parent_path).resolve() if req.parent_path else root
    if not parent.exists() or not parent.is_dir():
        raise HTTPException(404, f"父文件夹不存在: {req.parent_path}")
    if not str(parent).startswith(str(root)):
        raise HTTPException(403, "路径越界")
    new_dir = parent / req.name
    new_dir.mkdir(parents=True, exist_ok=True)
    return {"success": True, "path": new_dir.relative_to(root).as_posix()}


class FolderRenameRequest(BaseModel):
    path: str
    new_name: str


@router.put("/api/materials/folder")
async def materials_rename_folder(req: FolderRenameRequest):
    """重命名文件夹。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    target = (root / req.path).resolve()
    if not target.exists() or not target.is_dir():
        raise HTTPException(404, f"文件夹不存在: {req.path}")
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "路径越界")
    new_path = target.parent / req.new_name
    target.rename(new_path)
    return {"success": True, "path": new_path.relative_to(root).as_posix()}


class FileRenameRequest(BaseModel):
    path: str
    new_name: str


@router.put("/api/materials/file")
async def materials_rename_file(req: FileRenameRequest):
    """重命名文件。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    target = (root / req.path).resolve()
    if not target.exists() or not target.is_file():
        raise HTTPException(404, f"文件不存在: {req.path}")
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "路径越界")
    new_name = req.new_name.strip()
    if not new_name:
        raise HTTPException(400, "文件名不能为空")
    if '.' not in new_name:
        raise HTTPException(400, "文件名必须包含后缀名（如 .jpg、.png）")
    new_path = target.parent / new_name
    if new_path.exists():
        raise HTTPException(409, f"目标文件已存在: {new_name}")
    target.rename(new_path)
    return {"success": True, "path": new_path.relative_to(root).as_posix()}


@router.delete("/api/materials/folder")
async def materials_delete_folder(path: str = Query(...)):
    """递归删除文件夹及其内容。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    target = (root / path).resolve()
    if not target.exists() or not target.is_dir():
        raise HTTPException(404, f"文件夹不存在: {path}")
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "路径越界")
    if target == root:
        raise HTTPException(400, "不能删除根目录")
    shutil.rmtree(target)
    return {"success": True}


class MoveItemsRequest(BaseModel):
    items: List[str] = []
    destination: str = ""


@router.post("/api/materials/move")
async def materials_move_items(req: MoveItemsRequest):
    """移动文件/文件夹到目标目录。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    dest = (root / req.destination).resolve() if req.destination else root
    if not dest.exists() or not dest.is_dir():
        raise HTTPException(404, f"目标文件夹不存在: {req.destination}")
    if not str(dest).startswith(str(root)):
        raise HTTPException(403, "目标路径越界")

    moved = 0
    for item in req.items:
        fp = (root / item).resolve()
        if not fp.exists():
            continue
        if not str(fp).startswith(str(root)):
            continue
        if str(fp.parent) == str(dest) or str(dest) == str(fp) or str(dest).startswith(str(fp) + '/'):
            continue
        dest_path = dest / fp.name
        if dest_path.exists():
            stem = fp.stem
            suffix = fp.suffix if fp.is_file() else ""
            dest_path = dest / f"{stem}_{datetime.now().strftime('%H%M%S')}{suffix}"
        fp.rename(dest_path)
        moved += 1
    return {"success": True, "moved": moved}


# ── 素材评分与元数据 ───────────────────────────────────


@router.post("/api/materials/score")
async def materials_score(req: ScoreRequest):
    """对素材目录中的图片进行评分。"""
    paths = [str(Path(p).expanduser().resolve()) if not Path(p).is_absolute() else p for p in req.image_paths]
    if not paths:
        raise HTTPException(400, "没有可评分的图片路径")

    scores = score_images_batch(paths, use_vision=req.use_vision)
    scores_rel = {img_rel(k): v for k, v in scores.items()}
    for rel_path, score_info in scores_rel.items():
        app_state.update_materials_meta(rel_path, {
            "scored": True,
            "score": score_info["score"],
            "score_reason": score_info["reason"],
        })
    vision_count = sum(1 for v in scores.values() if v["method"] == "vision")
    heuristic_count = sum(1 for v in scores.values() if v["method"] == "heuristic")
    return {
        "success": True,
        "scores": scores_rel,
        "vision_count": vision_count,
        "heuristic_count": heuristic_count,
    }


@router.get("/api/materials/meta")
async def materials_get_meta(path: str = Query("")):
    """获取素材元数据。"""
    return {"meta": app_state.get_materials_meta(path or None)}


@router.put("/api/materials/meta")
async def materials_update_meta(req: Dict[str, Any]):
    """更新指定素材的元数据字段。"""
    path = req.get("path", "")
    if not path:
        raise HTTPException(400, "缺少 path")
    updates = {k: v for k, v in req.items() if k != "path"}
    app_state.update_materials_meta(path, updates)
    return {"success": True, "meta": app_state.get_materials_meta(path)}


@router.get("/api/materials/tags")
async def materials_get_tags():
    """获取所有素材标签聚合。"""
    return app_state.get_all_materials_tags()
