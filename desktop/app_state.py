"""应用内存状态管理。"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from config import DATA_DIR, QUEUE_CACHE_PATH
from utils.file import read_json, write_json
from services.cloud_sync import get_cloud_sync

OPLOG_CACHE_PATH = DATA_DIR / "state" / "operations.json"
ARTICLES_CACHE_PATH = DATA_DIR / "state" / "articles.json"
MATERIALS_META_PATH = DATA_DIR / "state" / "materials_meta.json"
PUBLISH_EFFECTS_PATH = DATA_DIR / "state" / "publish_effects.json"
CREDITS_CACHE_PATH = DATA_DIR / "state" / "credits.json"

# 积分配置
INITIAL_CREDITS = 100          # 首次启用赠送积分
PUBLISH_COST = 10              # 每次发布消耗积分
CHECKIN_REWARDS = [5, 10, 15, 20, 25, 30, 50]  # 连续签到7天的奖励
MAX_CREDIT_HISTORY = 500       # 积分流水保留条数


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
        self.active_tasks: set = set()
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
            return [a for a in self.articles if a.get("status") == status][::-1]
        return list(self.articles)[::-1]

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
        # 回填缺少 publish_time 的记录（兼容旧数据）
        dirty = False
        for eid, eff in effects.items():
            if not eff.get("publish_time"):
                queue_item = self.get_queue_item_by_id(eid)
                eff["publish_time"] = (queue_item or {}).get("time") or eff.get("updated_at") or datetime.now().isoformat(timespec="seconds")
                dirty = True
        if dirty:
            self._save_publish_effects()
        return dict(effects)

    def update_publish_effect(self, item_id: str, data: Dict[str, Any]) -> None:
        effects = self._ensure_publish_effects()
        data["updated_at"] = datetime.now().isoformat()
        # 自动补全 publish_time：优先用入参，否则取队列项的 time，最后兜底当前时间
        if "publish_time" not in data or not data["publish_time"]:
            queue_item = self.get_queue_item_by_id(item_id)
            data["publish_time"] = (queue_item or {}).get("time") or datetime.now().isoformat(timespec="seconds")
        if item_id in effects:
            effects[item_id].update(data)
        else:
            data["item_id"] = item_id
            effects[item_id] = data
        self._save_publish_effects()

    def delete_publish_effects_by_prefix(self, prefix: str) -> int:
        """删除 key 以指定前缀开头的 effect 记录，返回删除数量。"""
        effects = self._ensure_publish_effects()
        keys_to_delete = [k for k in effects if k.startswith(prefix)]
        for k in keys_to_delete:
            del effects[k]
        if keys_to_delete:
            self._save_publish_effects()
        return len(keys_to_delete)

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

    # ── 积分系统 ──────────────────────────────────────

    @staticmethod
    def _load_credits() -> Dict[str, Any]:
        raw = read_json(CREDITS_CACHE_PATH, default={})
        if not isinstance(raw, dict):
            raw = {}
        # 首次使用赠送初始积分
        if "balance" not in raw:
            raw["balance"] = INITIAL_CREDITS
            raw["transactions"] = [{
                "id": str(uuid.uuid4()),
                "type": "earn",
                "source": "gift",
                "amount": INITIAL_CREDITS,
                "balance_after": INITIAL_CREDITS,
                "description": "新用户赠送积分",
                "created_at": datetime.now().isoformat(),
            }]
            raw["daily_checkin"] = {"last_date": "", "streak": 0}
            raw["checkin_history"] = {}
            write_json(CREDITS_CACHE_PATH, raw)
        # 确保 checkin_history 字段存在（兼容旧数据）
        if "checkin_history" not in raw:
            raw["checkin_history"] = {}
        return raw

    def _ensure_credits(self) -> Dict[str, Any]:
        if not hasattr(self, '_credits'):
            self._credits = self._load_credits()
        return self._credits

    def _save_credits(self) -> None:
        write_json(CREDITS_CACHE_PATH, self._credits)
        # 异步同步到云端（不阻塞主线程）
        try:
            cloud_sync = get_cloud_sync()
            if cloud_sync.is_configured():
                import threading
                threading.Thread(
                    target=cloud_sync.sync_credits,
                    args=(self._credits.copy(),),
                    daemon=True
                ).start()
        except Exception:
            pass  # 同步失败不影响本地操作

    def get_credits_balance(self) -> int:
        """获取当前积分余额。"""
        credits = self._ensure_credits()
        return int(credits.get("balance", 0))

    def get_checkin_status(self) -> Dict[str, Any]:
        """获取今日签到状态。"""
        credits = self._ensure_credits()
        checkin = credits.get("daily_checkin", {})
        last_date = checkin.get("last_date", "")
        streak = checkin.get("streak", 0)
        today = datetime.now().strftime("%Y-%m-%d")
        can_checkin = last_date != today

        # 如果断签（最后签到不是今天也不是昨天），重置 streak 为 0
        yesterday = (datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                     - timedelta(days=1)).strftime("%Y-%m-%d")
        if last_date not in (today, yesterday):
            streak = 0

        # 计算今日签到可获得的积分
        if can_checkin:
            day_index = min(streak, len(CHECKIN_REWARDS) - 1)
            today_earned = CHECKIN_REWARDS[day_index]
        else:
            today_earned = 0
        return {
            "can_checkin": can_checkin,
            "streak": streak,
            "today_earned": today_earned,
        }

    def checkin(self) -> Dict[str, Any]:
        """执行每日签到，返回签到结果。"""
        credits = self._ensure_credits()
        checkin = credits.get("daily_checkin", {"last_date": "", "streak": 0})
        today = datetime.now().strftime("%Y-%m-%d")

        if checkin.get("last_date") == today:
            return {"success": False, "message": "今日已签到"}

        # 计算连续天数和积分
        yesterday = (datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                     - timedelta(days=1)).strftime("%Y-%m-%d")
        if checkin.get("last_date") == yesterday:
            streak = checkin.get("streak", 0) + 1
        else:
            streak = 1

        # 连续7天后重置
        if streak > 7:
            streak = 1

        day_index = min(streak - 1, len(CHECKIN_REWARDS) - 1)
        earned = CHECKIN_REWARDS[day_index]

        # 更新余额和签到状态
        credits["balance"] = credits.get("balance", 0) + earned
        credits["daily_checkin"] = {"last_date": today, "streak": streak}

        # 记录签到历史（用于日历展示）
        if "checkin_history" not in credits:
            credits["checkin_history"] = {}
        credits["checkin_history"][today] = {
            "earned": earned,
            "streak": streak,
        }

        # 记录交易
        if "transactions" not in credits:
            credits["transactions"] = []
        credits["transactions"].append({
            "id": str(uuid.uuid4()),
            "type": "earn",
            "source": "checkin",
            "amount": earned,
            "balance_after": credits["balance"],
            "description": f"连续签到第{streak}天",
            "created_at": datetime.now().isoformat(),
        })
        # 截断历史记录
        credits["transactions"] = credits["transactions"][-MAX_CREDIT_HISTORY:]
        self._save_credits()

        return {
            "success": True,
            "earned": earned,
            "streak": streak,
            "balance": credits["balance"],
        }

    def get_checkin_history(self, year: int, month: int) -> Dict[str, Any]:
        """获取指定月份的签到历史记录。"""
        credits = self._ensure_credits()
        checkin_history = credits.get("checkin_history", {})

        # 计算当月第一天和最后一天
        first_day = datetime(year, month, 1)
        if month == 12:
            last_day = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            last_day = datetime(year, month + 1, 1) - timedelta(days=1)

        # 提取当月签到记录
        records = {}
        current = first_day
        while current <= last_day:
            date_str = current.strftime("%Y-%m-%d")
            if date_str in checkin_history:
                records[date_str] = checkin_history[date_str]
            current += timedelta(days=1)

        # 计算当月统计
        total_days = last_day.day
        checked_days = len(records)
        total_earned = sum(r.get("earned", 0) for r in records.values())

        # 计算当前连续签到天数
        checkin = credits.get("daily_checkin", {})
        current_streak = checkin.get("streak", 0)

        # 计算当月最长连续签到
        max_streak = 0
        current_streak_in_month = 0
        current = first_day
        while current <= last_day:
            date_str = current.strftime("%Y-%m-%d")
            if date_str in records:
                current_streak_in_month += 1
                max_streak = max(max_streak, current_streak_in_month)
            else:
                current_streak_in_month = 0
            current += timedelta(days=1)

        return {
            "year": year,
            "month": month,
            "records": records,
            "total_days": total_days,
            "checked_days": checked_days,
            "total_earned": total_earned,
            "current_streak": current_streak,
            "max_streak_in_month": max_streak,
        }

    def spend_credits(self, amount: int, source: str, description: str) -> bool:
        """扣除积分。余额不足时返回 False。"""
        credits = self._ensure_credits()
        balance = credits.get("balance", 0)
        if balance < amount:
            return False
        credits["balance"] = balance - amount
        if "transactions" not in credits:
            credits["transactions"] = []
        credits["transactions"].append({
            "id": str(uuid.uuid4()),
            "type": "spend",
            "source": source,
            "amount": -amount,
            "balance_after": credits["balance"],
            "description": description,
            "created_at": datetime.now().isoformat(),
        })
        credits["transactions"] = credits["transactions"][-MAX_CREDIT_HISTORY:]
        self._save_credits()
        return True

    def add_credits(self, amount: int, source: str, description: str) -> int:
        """增加积分，返回增加后的余额。"""
        credits = self._ensure_credits()
        credits["balance"] = credits.get("balance", 0) + amount
        if "transactions" not in credits:
            credits["transactions"] = []
        credits["transactions"].append({
            "id": str(uuid.uuid4()),
            "type": "earn",
            "source": source,
            "amount": amount,
            "balance_after": credits["balance"],
            "description": description,
            "created_at": datetime.now().isoformat(),
        })
        credits["transactions"] = credits["transactions"][-MAX_CREDIT_HISTORY:]
        self._save_credits()
        return credits["balance"]

    def get_credits_history(self, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """获取积分流水，按时间倒序。"""
        credits = self._ensure_credits()
        transactions = list(reversed(credits.get("transactions", [])))
        total = len(transactions)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "transactions": transactions[start:end],
            "total": total,
            "page": page,
            "page_size": page_size,
        }


# 全局单例
app_state = AppState()
