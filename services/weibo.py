"""向后兼容适配层 — 请优先从 services.platforms.weibo 导入。"""

from services.platforms.weibo import (  # noqa: F401
    fetch_celebrity_discovery_posts,
    fetch_keyword_only_posts,
    fetch_own_timeline_paginated,
    fetch_super_topic_discovery_posts,
    fetch_super_topic_posts,
    fetch_weibo_posts,
    fetch_weibo_posts_paginated,
    finalize_posts,
    infer_scene_from_post_text,
    resolve_uid_for_nickname,
)
