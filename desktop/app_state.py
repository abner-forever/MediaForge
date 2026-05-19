"""应用内存状态管理。"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from config import DATA_DIR, QUEUE_CACHE_PATH
from utils.file import read_json, write_json

OPLOG_CACHE_PATH = DATA_DIR / "state" / "operations.json"
ARTICLES_CACHE_PATH = DATA_DIR / "state" / "articles.json"


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
        self._operations: List[Dict[str, Any]] = self._load_operations()
        self.articles: List[Dict[str, Any]] = self._load_articles()

    # ── 队列持久化 ─────────────────────────────────────
    @staticmethod
    def _load_queue() -> List[Dict[str, Any]]:
        raw = read_json(QUEUE_CACHE_PATH, default=[])
        return raw if isinstance(raw, list) else []

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
                           "tags", "celebrity", "source", "ai_generated", "status"}
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
    def clear_publish_logs(self) -> None:
        self.publish_logs.clear()
        self.publish_active = True

    def add_publish_log(self, msg: str) -> None:
        self.publish_logs.append(msg)

    def finish_publish(self) -> None:
        self.publish_active = False

    def get_publish_logs(self) -> List[str]:
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
