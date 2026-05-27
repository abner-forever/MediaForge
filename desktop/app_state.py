"""应用内存状态管理。"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from config import DATA_DIR, QUEUE_CACHE_PATH
from utils.file import read_json, write_json

OPLOG_CACHE_PATH = DATA_DIR / "state" / "operations.json"
ARTICLES_CACHE_PATH = DATA_DIR / "state" / "articles.json"
MATERIALS_META_PATH = DATA_DIR / "state" / "materials_meta.json"
PUBLISH_EFFECTS_PATH = DATA_DIR / "state" / "publish_effects.json"


class AppState:
    """单例应用状态，存储选中图片、发布队列、评分数据等。"""

    def __init__(self) -> None:
        self.selected_images: List[str] = []
        self.publish_queue: List[Dict[str, Any]] = self._load_queue()
        self.discovery_results: List[Dict[str, Any]] = []
        self.image_scores: Dict[str, Dict[str, Any]] = {}
        self.run_log: str = ""
        self.publish_logs: List[str] = []
        self.publish_active: bool = False
        self._publish_logs_map: Dict[str, List[str]] = {}
        self._publish_lock = threading.Lock()
        self._operations: List[Dict[str, Any]] = self._load_operations()
        self.articles: List[Dict[str, Any]] = self._load_articles()

    # ── 队列持久化 ─────────────────────────────────────
    @staticmethod
    def _load_queue() -> List[Dict[str, Any]]:
        raw = read_json(QUEUE_CACHE_PATH, default=[])
        if not isinstance(raw, list):
            return []
        for item in raw:
            if "id" not in item:
                item["id"] = str(uuid.uuid4())
        return raw

    def _save_queue(self) -> None:
        write_json(QUEUE_CACHE_PATH, self.publish_queue)

    # ── 选中图片 ──────────────────────────────────────
    def add_selected_image(self, path: str) -> None:
        if path not in self.selected_images:
            self.selected_images.append(path)

    def remove_selected_image(self, path: str) -> None:
        if path in self.selected_images:
            self.selected_images.remove(path)

    def clear_selected_images(self) -> None:
        self.selected_images.clear()

    def get_selected_images(self) -> List[str]:
        return list(self.selected_images)

    # ── 发布队列 ──────────────────────────────────────
    def add_to_queue(self, item: Dict[str, Any]) -> None:
        item["time"] = datetime.now().isoformat()
        item["id"] = str(uuid.uuid4())
        self.publish_queue.append(item)
        self._save_queue()

    def remove_from_queue(self, index: int) -> bool:
        if 0 <= index < len(self.publish_queue):
            self.publish_queue.pop(index)
            self._save_queue()
            return True
        return False

    def remove_from_queue_by_id(self, item_id: str) -> bool:
        for i, item in enumerate(self.publish_queue):
            if item.get("id") == item_id:
                self.publish_queue.pop(i)
                self._save_queue()
                return True
        return False

    def get_queue(self) -> List[Dict[str, Any]]:
        return list(self.publish_queue)

    def update_queue_item(self, index: int, updates: Dict[str, Any]) -> bool:
        if 0 <= index < len(self.publish_queue):
            self.publish_queue[index].update(updates)
            self._save_queue()
            return True
        return False

    def update_queue_item_by_id(self, item_id: str, updates: Dict[str, Any]) -> bool:
        for item in self.publish_queue:
            if item.get("id") == item_id:
                item.update(updates)
                self._save_queue()
                return True
        return False

    def get_queue_item_by_id(self, item_id: str) -> Optional[Dict[str, Any]]:
        for item in self.publish_queue:
            if item.get("id") == item_id:
                return item
        return None

    # ── 文章管理 ──────────────────────────────────────
    @staticmethod
    def _load_articles() -> List[Dict[str, Any]]:
        return read_json(ARTICLES_CACHE_PATH, default=[])

    def _save_articles(self) -> None:
        write_json(ARTICLES_CACHE_PATH, self.articles)

    def get_articles(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        if status:
            return [a for a in self.articles if a.get("status") == status]
        return list(self.articles)

    def get_article(self, article_id: str) -> Optional[Dict[str, Any]]:
        for a in self.articles:
            if a.get("id") == article_id:
                return dict(a)
        return None

    def add_article(self, data: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now().isoformat()
        article = {
            "id": str(uuid.uuid4()),
            "title": data.get("title", ""),
            "content": data.get("content", ""),
            "summary": data.get("summary", ""),
            "cover": data.get("cover", ""),
            "images": list(data.get("images", [])),
            "tags": list(data.get("tags", [])),
            "celebrity": data.get("celebrity", ""),
            "source": data.get("source", ""),
            "ai_generated": data.get("ai_generated", False),
            "status": data.get("status", "draft"),
            "created_at": now,
            "updated_at": now,
        }
        self.articles.append(article)
        self._save_articles()
        return article

    def update_article(self, article_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for i, a in enumerate(self.articles):
            if a.get("id") == article_id:
                allowed = {"title", "content", "summary", "cover", "images",
                           "tags", "celebrity", "source", "ai_generated", "status",
                           "account_id", "error"}
                for k, v in updates.items():
                    if k in allowed:
                        self.articles[i][k] = v
                self.articles[i]["updated_at"] = datetime.now().isoformat()
                self._save_articles()
                return dict(self.articles[i])
        return None

    def delete_article(self, article_id: str) -> bool:
        for i, a in enumerate(self.articles):
            if a.get("id") == article_id:
                self.articles.pop(i)
                self._save_articles()
                return True
        return False

    # ── 素材元数据 ───────────────────────────────────
    @staticmethod
    def _load_materials_meta() -> Dict[str, Any]:
        return read_json(MATERIALS_META_PATH, default={})

    def _save_materials_meta(self) -> None:
        write_json(MATERIALS_META_PATH, self._materials_meta)

    def _ensure_materials_meta(self) -> Dict[str, Any]:
        if not hasattr(self, '_materials_meta'):
            self._materials_meta = self._load_materials_meta()
        return self._materials_meta

    def get_materials_meta(self, path: Optional[str] = None) -> Any:
        meta = self._ensure_materials_meta()
        if path:
            return meta.get(path)
        return dict(meta)

    def update_materials_meta(self, path: str, updates: Dict[str, Any]) -> None:
        meta = self._ensure_materials_meta()
        if path not in meta:
            meta[path] = {"path": path, "tags": [], "source_platform": "", "source_url": "",
                          "used_count": 0, "used_in_articles": [], "is_cover": False,
                          "celebrity": "", "scene": "", "scored": False,
                          "score": 0, "score_reason": ""}
        meta[path].update(updates)
        self._save_materials_meta()

    def batch_update_materials_meta(self, updates: Dict[str, Dict[str, Any]]) -> None:
        for path, data in updates.items():
            self.update_materials_meta(path, data)

    def get_all_materials_tags(self) -> Dict[str, list]:
        meta = self._ensure_materials_meta()
        tags: set = set()
        celebrities: set = set()
        scenes: set = set()
        for path, data in meta.items():
            if not isinstance(data, dict):
                continue
            for t in data.get("tags", []):
                tags.add(t)
            if data.get("celebrity"):
                celebrities.add(data["celebrity"])
            if data.get("scene"):
                scenes.add(data["scene"])
        return {"tags": sorted(tags), "celebrities": sorted(celebrities), "scenes": sorted(scenes)}

    def delete_materials_meta(self, paths: List[str]) -> int:
        meta = self._ensure_materials_meta()
        deleted = 0
        for p in paths:
            if p in meta:
                del meta[p]
                deleted += 1
        if deleted:
            self._save_materials_meta()
        return deleted

    def get_folder_sort_order(self, folder_path: str) -> list:
        """获取文件夹内文件的自定义排序顺序（文件名列表）。"""
        meta = self._ensure_materials_meta()
        return meta.get(f"_sort:{folder_path}", [])

    def set_folder_sort_order(self, folder_path: str, order: list) -> None:
        """保存文件夹内文件的自定义排序顺序。"""
        meta = self._ensure_materials_meta()
        meta[f"_sort:{folder_path}"] = order
        self._save_materials_meta()

    # ── 发布效果 ──────────────────────────────────────
    @staticmethod
    def _load_publish_effects() -> Dict[str, Any]:
        return read_json(PUBLISH_EFFECTS_PATH, default={})

    def _save_publish_effects(self) -> None:
        write_json(PUBLISH_EFFECTS_PATH, self._publish_effects)

    def _ensure_publish_effects(self) -> Dict[str, Any]:
        if not hasattr(self, '_publish_effects'):
            self._publish_effects = self._load_publish_effects()
        return self._publish_effects

    def get_publish_effects(self, item_id: Optional[str] = None) -> Any:
        effects = self._ensure_publish_effects()
        if item_id:
            return effects.get(item_id)
        return dict(effects)

    def update_publish_effect(self, item_id: str, data: Dict[str, Any]) -> None:
        effects = self._ensure_publish_effects()
        data["updated_at"] = datetime.now().isoformat()
        if item_id in effects:
            effects[item_id].update(data)
        else:
            data["item_id"] = item_id
            effects[item_id] = data
        self._save_publish_effects()

    # ── 操作记录 ──────────────────────────────────────
    @staticmethod
    def _load_operations() -> List[Dict[str, Any]]:
        ops = read_json(OPLOG_CACHE_PATH, default=[])
        # 确保每个操作有 id（兼容旧数据）
        for op in ops:
            if "id" not in op:
                op["id"] = str(uuid.uuid4())
        return ops

    def _save_operations(self) -> None:
        write_json(OPLOG_CACHE_PATH, self._operations[-200:])

    def add_operation(self, action: str, detail: str = "") -> None:
        self._operations.append({
            "id": str(uuid.uuid4()),
            "time": datetime.now().isoformat(),
            "action": action,
            "detail": detail,
        })
        self._save_operations()

    def get_operations(self, page: int = 1, page_size: int = 10) -> tuple[List[Dict[str, Any]], int]:
        """分页返回操作记录，按时间倒序（最新在前）。返回 (items, total)。"""
        reversed_ops = list(reversed(self._operations))
        total = len(reversed_ops)
        start = (page - 1) * page_size
        end = start + page_size
        return reversed_ops[start:end], total

    def delete_operations_by_id(self, op_ids: List[str]) -> int:
        """删除指定 id 的操作记录，返回删除数量。"""
        if not op_ids:
            return 0
        id_set = set(op_ids)
        before = len(self._operations)
        self._operations = [op for op in self._operations if op.get("id") not in id_set]
        deleted = before - len(self._operations)
        if deleted:
            self._save_operations()
        return deleted

    def clear_all_operations(self) -> None:
        """清空所有操作记录。"""
        self._operations.clear()
        self._save_operations()

    # ── 发布日志 ──────────────────────────────────────
    def clear_publish_logs(self, session_id: str = "") -> None:
        """清空发布日志（兼容旧版无 session 调用）。"""
        with self._publish_lock:
            if session_id:
                self._publish_logs_map[session_id] = []
            else:
                self.publish_logs.clear()
        self.publish_active = True

    def add_publish_log(self, msg: str, session_id: str = "") -> None:
        """添加发布日志，按 session_id 隔离多个并发发布。"""
        with self._publish_lock:
            if session_id:
                if session_id not in self._publish_logs_map:
                    self._publish_logs_map[session_id] = []
                self._publish_logs_map[session_id].append(msg)
            else:
                self.publish_logs.append(msg)

    def finish_publish(self) -> None:
        self.publish_active = False

    def get_publish_logs(self, session_id: str = "") -> List[str]:
        with self._publish_lock:
            if session_id:
                return list(self._publish_logs_map.get(session_id, []))
            return list(self.publish_logs)

    # ── 发现结果 ──────────────────────────────────────
    def set_discovery_results(self, posts: List[Dict[str, Any]]) -> None:
        self.discovery_results = posts

    def get_discovery_results(self) -> List[Dict[str, Any]]:
        return list(self.discovery_results)

    def clear_discovery_results(self) -> None:
        self.discovery_results.clear()
        self.image_scores.clear()

    # ── 评分 ──────────────────────────────────────────
    def set_image_scores(self, scores: Dict[str, Dict[str, Any]]) -> None:
        self.image_scores.update(scores)

    def get_image_scores(self) -> Dict[str, Dict[str, Any]]:
        return dict(self.image_scores)


# 全局单例
app_state = AppState()
