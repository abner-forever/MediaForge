"""应用内存状态管理。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from config import DATA_DIR, QUEUE_CACHE_PATH
from utils.file import read_json, write_json

OPLOG_CACHE_PATH = DATA_DIR / "state" / "operations.json"


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

    # ── 操作记录 ──────────────────────────────────────
    @staticmethod
    def _load_operations() -> List[Dict[str, Any]]:
        return read_json(OPLOG_CACHE_PATH, default=[])

    def _save_operations(self) -> None:
        write_json(OPLOG_CACHE_PATH, self._operations[-50:])

    def add_operation(self, action: str, detail: str = "") -> None:
        self._operations.append({
            "time": datetime.now().isoformat(),
            "action": action,
            "detail": detail,
        })
        self._save_operations()

    def get_operations(self, limit: int = 20) -> List[Dict[str, Any]]:
        return list(self._operations[-limit:])

    def delete_operations(self, indices: List[int]) -> int:
        """删除指定索引（从末尾数起）的操作记录，返回删除数量。"""
        if not indices:
            return 0
        valid = set()
        total = len(self._operations)
        for i in indices:
            if 0 <= i < total:
                valid.add(i)
        if not valid:
            return 0
        self._operations = [op for idx, op in enumerate(self._operations) if idx not in valid]
        self._save_operations()
        return len(valid)

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
