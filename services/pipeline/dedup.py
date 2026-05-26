"""帖子去重缓存（与 main.py 共享）。"""

from typing import Dict, Set

from config import POSTS_CACHE_PATH
from utils.file import hash_text, read_json, write_json


def _load_cache() -> Dict[str, Set[str]]:
    raw = read_json(POSTS_CACHE_PATH, default={})
    if isinstance(raw, list):
        return {"post_ids": set(), "post_hashes": set(str(v) for v in raw)}
    if isinstance(raw, dict):
        return {
            "post_ids": set(str(v) for v in raw.get("post_ids", [])),
            "post_hashes": set(str(v) for v in raw.get("post_hashes", [])),
        }
    return {"post_ids": set(), "post_hashes": set()}


def _save_cache(cache: Dict[str, Set[str]]) -> None:
    write_json(POSTS_CACHE_PATH, {
        "post_ids": sorted(cache["post_ids"]),
        "post_hashes": sorted(cache["post_hashes"]),
    })
