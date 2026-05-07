import json
import time
import re
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional, Set
from urllib.parse import quote

import requests

from config import WEIBO_TOPIC_CACHE_PATH, WEIBO_UID_CACHE_PATH, resolve_weibo_fetch_mode, settings
from utils.file import hash_text, read_json, write_json
from utils.logger import get_logger


logger = get_logger(__name__)

_SCENE_BUILTIN = (
    "巴黎时装周",
    "米兰时装周",
    "纽约时装周",
    "伦敦时装周",
    "上海时装周",
    "时装秀",
    "大秀",
    "GQ盛典",
    "GQ",
    "红毯",
    "杀青",
    "定妆照",
    "定妆",
    "私服",
    "街拍",
    "路透",
    "活动",
    "领奖",
    "写真",
    "时装周",
)


def infer_scene_from_post_text(text: str) -> str:
    """从正文猜场景标签；长词优先匹配（如优先于「时装周」命中「巴黎时装周」）。"""
    t = (text or "").strip()
    if not t:
        return "日常"
    ordered = list(
        dict.fromkeys(
            list(settings.weibo_search_tags)
            + list(settings.weibo_scene_extra_tags)
            + list(_SCENE_BUILTIN)
        )
    )
    for phrase in sorted(ordered, key=len, reverse=True):
        if phrase and phrase in t:
            return phrase[:40]
    return "日常"


def _extract_xsrf_token(cookie: str) -> str:
    for part in cookie.split(";"):
        kv = part.strip().split("=", 1)
        if len(kv) == 2 and kv[0] == "XSRF-TOKEN":
            return kv[1]
    return ""


def _json_headers(base_referer: str = "https://weibo.com/") -> dict:
    xsrf_token = _extract_xsrf_token(settings.weibo_cookie)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
        ),
        "Cookie": settings.weibo_cookie,
        "Referer": base_referer,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
    }
    if xsrf_token:
        headers["X-XSRF-TOKEN"] = xsrf_token
    return headers


def _infer_uid_from_all_groups() -> str:
    if not settings.weibo_cookie:
        return ""
    try:
        resp = requests.get(
            "https://weibo.com/ajax/feed/allGroups",
            headers=_json_headers(),
            timeout=settings.request_timeout,
        )
        resp.raise_for_status()
        body = resp.text
        matched = re.search(r"107603(\d{8,})", body)
        if matched:
            uid = matched.group(1)
            logger.info("已自动推断 WEIBO_UID=%s", uid)
            return uid
    except Exception as err:
        logger.error("自动推断 WEIBO_UID 失败: %s", err)
    return ""


def _mobile_container_id(kind: str, keyword: str) -> str:
    inner = f"type={kind}&q={keyword}"
    return "100103" + quote(inner, safe="")


def _mobile_headers(referer: str = "https://m.weibo.cn/") -> dict:
    return {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
        ),
        "Cookie": settings.weibo_cookie,
        "Referer": referer,
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
    }


def _request_with_retry(url: str, params_list: Iterable[Mapping[str, object]]) -> dict:
    headers = _json_headers()
    last_err: Optional[BaseException] = None
    for i in range(settings.retry_times):
        for params in params_list:
            try:
                resp = requests.get(
                    url,
                    params=dict(params),
                    headers=headers,
                    timeout=settings.request_timeout,
                )
                resp.raise_for_status()
                return resp.json()
            except BaseException as err:
                last_err = err
                logger.error("微博请求失败，第 %s 次重试，params=%s: %s", i + 1, params, err)
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"微博请求失败: {last_err}")


def _get_json_single(url: str, params: dict, *, referer: Optional[str] = None) -> dict:
    hdr = _json_headers() if referer is None else _json_headers(referer)
    resp = requests.get(url, params=params, headers=hdr, timeout=settings.request_timeout)
    resp.raise_for_status()
    payload = resp.json()
    if isinstance(payload, dict) and payload.get("ok") in (0, "0"):
        logger.error(
            "微博接口返回失败 msg=%s url=%s",
            payload.get("msg") or payload.get("errno"),
            resp.url,
        )
    logger.info("[DEBUG] API %s ok=%s keys=%s", resp.url, payload.get("ok") if isinstance(payload, dict) else "?", list(payload.keys()) if isinstance(payload, dict) else "?")
    return payload


def _load_uid_cache() -> MutableMapping[str, str]:
    raw = read_json(WEIBO_UID_CACHE_PATH, default={})
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items()}
    return {}


def _save_uid_cache(obj: Mapping[str, str]) -> None:
    write_json(WEIBO_UID_CACHE_PATH, dict(sorted(obj.items())))


def _load_topic_cache() -> MutableMapping[str, str]:
    raw = read_json(WEIBO_TOPIC_CACHE_PATH, default={})
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items()}
    return {}


def _save_topic_cache(obj: Mapping[str, str]) -> None:
    write_json(WEIBO_TOPIC_CACHE_PATH, dict(sorted(obj.items())))


def _first_topic_hash_from_side_payload(payload: dict, topic_name: str) -> str:
    """从桌面端搜索结果中提取超话 hash。"""
    strip_name = topic_name.replace("超话", "").strip()
    for key in ("topics", "realtime", "data"):
        blk = payload.get(key)
        items: List = []
        if isinstance(blk, list):
            items = blk
        elif isinstance(blk, dict):
            items = blk.get("topics") or blk.get("list") or blk.get("data") or []
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            topic_id = str(item.get("topic_id") or item.get("tid") or "")
            title = item.get("topic_title") or item.get("title") or ""
            if topic_id and re.match(r"^[a-f0-9]{6,}$", topic_id):
                if not strip_name or strip_name in title or strip_name in topic_name:
                    return topic_id
    blob = json.dumps(payload, ensure_ascii=False)
    m = re.search(r"100808([a-f0-9]{6,})", blob)
    if m:
        return m.group(1)
    return ""


def _first_topic_hash_from_mobile_cards(payload: dict, topic_name: str) -> str:
    """从移动端搜索结果中提取超话 hash。"""
    strip_name = topic_name.replace("超话", "").strip()
    cards = payload.get("data", {}).get("cards", []) or []
    for card in cards:
        # card 级别
        itemid = str(card.get("itemid") or "")
        m = re.search(r"topic_(100808)?([a-f0-9]{6,})", itemid)
        if m:
            return m.group(2)
        scheme = str(card.get("scheme") or "")
        m = re.search(r"100808([a-f0-9]{6,})", scheme)
        if m:
            return m.group(1)
        # card_group 级别
        for grp in card.get("card_group", []) or []:
            itemid = str(grp.get("itemid") or "")
            m = re.search(r"topic_(100808)?([a-f0-9]{6,})", itemid)
            if m:
                return m.group(2)
            scheme = str(grp.get("scheme") or "")
            m = re.search(r"100808([a-f0-9]{6,})", scheme)
            if m:
                return m.group(1)
            containerid = str(grp.get("containerid") or "")
            m = re.search(r"100808([a-f0-9]{6,})", containerid)
            if m:
                return m.group(1)
    # 兜底：全文正则
    blob = json.dumps(payload, ensure_ascii=False)
    m = re.search(r"100808([a-f0-9]{6,})", blob)
    if m:
        return m.group(1)
    return ""


def resolve_super_topic_hash(topic_name: str) -> str:
    """解析超话名称 → 超话 hash（100808 后面的部分），结果缓存到 JSON。"""
    cache = _load_topic_cache()
    if topic_name in cache:
        logger.info("使用缓存的超话 hash「%s」→ %s", topic_name, cache[topic_name])
        return cache[topic_name]

    search_name = topic_name.replace("超话", "").strip() or topic_name
    hash_val = ""
    try:
        cid = _mobile_container_id("38", search_name)
        resp = requests.get(
            "https://m.weibo.cn/api/container/getIndex",
            params={"containerid": cid, "page_type": "searchall", "page": 1},
            headers=_mobile_headers(f"https://m.weibo.cn/search?q={quote(search_name, safe='')}"),
            timeout=settings.request_timeout,
        )
        resp.raise_for_status()
        payload = resp.json()
        logger.info("[DEBUG] 超话搜索 mobile API ok=%s keys=%s", payload.get("ok"), list(payload.keys()) if isinstance(payload, dict) else "?")
        hash_val = _first_topic_hash_from_mobile_cards(payload, topic_name)
    except Exception as err:
        logger.error("超话搜索失败(%s)：%s", topic_name, err)

    if not hash_val:
        try:
            cid = _mobile_container_id("38", topic_name)
            resp = requests.get(
                "https://m.weibo.cn/api/container/getIndex",
                params={"containerid": cid, "page_type": "searchall", "page": 1},
                headers=_mobile_headers(f"https://m.weibo.cn/search?q={quote(topic_name, safe='')}"),
                timeout=settings.request_timeout,
            )
            resp.raise_for_status()
            payload = resp.json()
            hash_val = _first_topic_hash_from_mobile_cards(payload, topic_name)
        except Exception as err:
            logger.error("超话搜索重试失败(%s)：%s", topic_name, err)

    if hash_val:
        cache[topic_name] = hash_val
        _save_topic_cache(cache)
        logger.info("已解析超话「%s」→ hash=%s", topic_name, hash_val)
    else:
        logger.error("未能解析超话「%s」的 hash", topic_name)
    return hash_val


def resolve_uid_for_nickname(nickname: str) -> str:
    cache = _load_uid_cache()
    if nickname in cache:
        logger.info("使用缓存的微博 UID「%s」→ %s", nickname, cache[nickname])
        return cache[nickname]

    cid = _mobile_container_id("3", nickname)
    uid = ""
    try:
        payload = _get_json_single(
            "https://m.weibo.cn/api/container/getIndex",
            {"containerid": cid, "page_type": "searchall", "page": 1},
            referer=f"https://m.weibo.cn/search?q={quote(nickname, safe='')}",
        )
        uid = _first_uid_from_mobile_cards(payload, nickname)
    except Exception as err:
        logger.error("m 端用户检索失败(%s)：%s", nickname, err)

    if uid:
        cache[nickname] = uid
        _save_uid_cache(cache)
        return uid

    # 备选：网页端 side search（结构不稳定，仅兜底）
    try:
        payload = _get_json_single(
            "https://weibo.com/ajax/side/search",
            {"q": nickname, "type": "user", "page": 1},
            referer="https://weibo.com/",
        )
        uid = _first_uid_from_side_payload(payload, nickname)
    except Exception as err:
        logger.error("网页侧用户检索失败(%s)：%s", nickname, err)

    if uid:
        cache[nickname] = uid
        _save_uid_cache(cache)
    return uid


def _first_uid_from_mobile_cards(payload: dict, nickname: str) -> str:
    cards = payload.get("data", {}).get("cards", []) or []
    for card in cards:
        for grp in card.get("card_group", []) or []:
            user = grp.get("user")
            if not isinstance(user, dict):
                continue
            screen = user.get("screen_name") or user.get("name") or ""
            if nickname == screen or (screen and nickname in screen):
                return str(user.get("id") or user.get("idstr") or "").strip()

    fallback = ""
    blob = json.dumps(payload, ensure_ascii=False)
    m = re.search(r'"screen_name"\s*:\s*"%s"[^{}]{0,200}?"id"\s*:\s*"?(\d+)' % re.escape(nickname), blob)
    if not m:
        m = re.search(r'"screen_name"\s*:\s*"%s"[^{}]{0,200}?"idstr"\s*:\s*"?(\d+)' % re.escape(nickname), blob)
    if m:
        fallback = m.group(1).strip()
    return fallback


def _first_uid_from_side_payload(payload: dict, nickname: str) -> str:
    for key in ("users", "realtime", "data"):
        blk = payload.get(key)
        items: List = []
        if isinstance(blk, list):
            items = blk
        elif isinstance(blk, dict):
            items = blk.get("users") or blk.get("list") or blk.get("data") or []
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                sid = (
                    item.get("id") or item.get("idstr") or item.get("uid")
                    if "screen_name" in item or "name" in item
                    else None
                )
                name = item.get("screen_name") or item.get("name") or ""
                if sid and (nickname == name or (name and nickname in name)):
                    return str(sid)
    return ""


def _strip_simple_html(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").replace("&nbsp;", " ").strip()


def _extract_images(item: dict) -> List[str]:
    urls: List[str] = []

    for key in (
        "bmiddle_pic",
        "original_pic",
        "thumbnail_pic",
        "gif_url",
    ):
        u = item.get(key)
        if isinstance(u, str) and u.startswith("http"):
            urls.append(u)

    pics_raw = item.get("pics")
    if isinstance(pics_raw, str) and pics_raw.startswith("http"):
        urls.append(pics_raw)

    pics = pics_raw if isinstance(pics_raw, list) else []
    for p in pics or []:
        if not isinstance(p, dict):
            continue
        u = None
        large = p.get("large")
        largest = p.get("largest")
        if isinstance(large, dict):
            u = large.get("url")
        if not u and isinstance(largest, dict):
            u = largest.get("url")
        if not u and isinstance(large, str):
            u = large
        if not u and isinstance(p.get("bmiddle_pic"), str):
            u = p.get("bmiddle_pic")
        if not u and isinstance(p.get("url"), str):
            u = p.get("url")
        if isinstance(u, str) and u.startswith("http"):
            urls.append(u)

    pic_infos = item.get("pic_infos", {})
    if isinstance(pic_infos, dict):
        for info in pic_infos.values():
            if not isinstance(info, dict):
                continue
            img = (
                info.get("largest", {}).get("url")
                if isinstance(info.get("largest"), dict)
                else None
            )
            if not isinstance(img, str):
                img = (
                    info.get("large", {}).get("url")
                    if isinstance(info.get("large"), dict)
                    else None
                )
            if not isinstance(img, str):
                img = (
                    info.get("original", {}).get("url")
                    if isinstance(info.get("original"), dict)
                    else None
                )
            if isinstance(img, str):
                urls.append(img)

    mix_items = (item.get("mix_media_info", {}) or {}).get("items", []) or []
    for media in mix_items:
        data = media.get("data", {}) or {}
        u = (
            data.get("largest", {}).get("url")
            if isinstance(data.get("largest"), dict)
            else None
        )
        if not isinstance(u, str):
            u = (
                data.get("big_pic", {}).get("url")
                if isinstance(data.get("big_pic"), dict)
                else None
            )
        if not isinstance(u, str):
            u = (
                data.get("pic_info", {}).get("largest", {}).get("url")
                if isinstance(data.get("pic_info"), dict)
                else None
            )
        if isinstance(u, str):
            urls.append(u)

    retweeted = item.get("retweeted_status", {})
    if isinstance(retweeted, dict) and retweeted:
        urls.extend(_extract_images(retweeted))

    unique: List[str] = []
    seen = set()
    for u in urls:
        if u.startswith("http") and u not in seen:
            seen.add(u)
            unique.append(u)
    return unique


def _post_from_card(
    mblog: dict,
    *,
    celebrity: str,
    source: str,
    scene_hint: Optional[str] = None,
) -> Optional[Dict]:
    if not isinstance(mblog, dict):
        return None
    image_urls = _extract_images(mblog)
    if not image_urls:
        return None

    pid = str(mblog.get("id") or mblog.get("mid") or mblog.get("idstr") or "").strip()
    raw_text = mblog.get("text_raw") or mblog.get("raw_text") or mblog.get("text") or ""
    text_plain = raw_text if not isinstance(raw_text, str) or "<" not in raw_text else _strip_simple_html(raw_text)
    scene = (scene_hint or "").strip() or infer_scene_from_post_text(text_plain.strip())

    user = mblog.get("user") or {}
    screen_name = user.get("screen_name") or ""

    return {
        "id": pid,
        "text": text_plain.strip(),
        "images": image_urls,
        "celebrity": celebrity,
        "source": source,
        "scene": scene,
        "screen_name": screen_name,
        "created_at": mblog.get("created_at") or "",
    }


def _parse_mblogs_from_cards_payload(payload: dict) -> List[dict]:
    out: List[dict] = []
    cards = payload.get("data", {}).get("cards", []) or []
    for card in cards:
        for grp in card.get("card_group", []) or []:
            mb = grp.get("mblog")
            if mb:
                out.append(mb)

        mb = card.get("mblog")
        if mb:
            out.append(mb)
    return out


def fetch_keyword_timeline_mobile(keyword: str, *, page: int, celebrity: str, scene: str) -> List[Dict]:
    """通过桌面端 API 搜索关键词帖子。"""
    payload = _request_with_retry(
        url="https://weibo.com/ajax/statuses/search",
        params_list=(
            {"q": keyword, "page": page, "hasori": "1", "hasret": "1", "hastext": "1", "haspic": "1", "category": "1"},
            {"q": keyword, "page": page, "haspic": "1"},
            {"q": keyword, "page": page},
        ),
    )
    statuses = payload.get("data", {}).get("list", []) or []

    parsed: List[Dict] = []
    for item in statuses:
        pt = _post_from_card(item, celebrity=celebrity, source="search_desktop", scene_hint=scene)
        if pt:
            parsed.append(pt)

    logger.info(
        "关键词搜索「%s」第%s页原始帖子 %s → 含图帖子 %s",
        keyword, page, len(statuses), len(parsed),
    )
    return parsed


def fetch_mymblog_for_uid(uid: str, *, page: int, celebrity_hint: str) -> List[Dict]:
    url = "https://weibo.com/ajax/statuses/mymblog"
    payload = _request_with_retry(
        url=url,
        params_list=(
            {"uid": uid, "page": page, "feature": "0"},
            {"uid": uid, "page": page},
            {"uid": uid, "page": page, "is_all": "1"},
        ),
    )
    raw_posts = payload.get("data", {}).get("list", []) or []

    resolved: List[Dict] = []
    for item in raw_posts:
        image_urls = _extract_images(item)
        if not image_urls:
            continue
        pid = str(item.get("id") or "")
        text = item.get("text_raw") or item.get("text") or ""
        text_plain = text if isinstance(text, str) and "<" not in text else _strip_simple_html(text)
        text_plain = text_plain.strip()
        user = item.get("user") or {}
        screen_name = user.get("screen_name") or ""
        resolved.append(
            {
                "id": pid.strip(),
                "text": text_plain,
                "images": image_urls,
                "celebrity": celebrity_hint,
                "source": "mymblog",
                "scene": infer_scene_from_post_text(text_plain),
                "screen_name": screen_name,
                "created_at": item.get("created_at") or "",
            }
        )
    logger.info(
        "用户时间线(uid=%s)第%s页：原始帖子 %s，含图帖子 %s",
        uid,
        page,
        len(raw_posts),
        len(resolved),
    )
    return resolved


def fetch_weibo_posts(page: int = 1) -> List[Dict]:
    weibo_uid = settings.weibo_uid or _infer_uid_from_all_groups()
    if not weibo_uid:
        raise RuntimeError("缺少 WEIBO_UID，且无法从 allGroups 自动推断，请在 .env 中配置")

    celebrity = "本人"
    return fetch_mymblog_for_uid(weibo_uid, page=page, celebrity_hint=celebrity)


def fetch_own_timeline_paginated(max_pages: int = 1) -> List[Dict]:
    merged: List[Dict] = []
    seen_ids: Set[str] = set()
    for page_no in range(1, max(1, max_pages) + 1):
        for post in fetch_weibo_posts(page=page_no):
            pid = post.get("id") or ""
            if pid and pid in seen_ids:
                continue
            if pid:
                seen_ids.add(pid)
            merged.append(post)
        time.sleep(0.8)
    return merged


def _finalize_post_meta(post: Dict) -> Dict:
    """确保下载分组字段始终为可用的短字符串。"""
    out = dict(post)
    celeb_raw = out.get("celebrity")
    if isinstance(celeb_raw, str) and celeb_raw.strip():
        out["celebrity"] = celeb_raw.strip()
    else:
        out["celebrity"] = "未命名艺人"
    scene_raw = out.get("scene")
    if isinstance(scene_raw, str) and scene_raw.strip():
        out["scene"] = scene_raw.strip()
    elif out.get("text"):
        out["scene"] = infer_scene_from_post_text(str(out.get("text", "")))
    else:
        out["scene"] = "日常"
    return out


def _merge_post_lists(groups: Iterable[List[Dict]]) -> List[Dict]:
    merged: List[Dict] = []
    seen_keys: Set[str] = set()
    for grp in groups:
        for post in grp:
            pid = str(post.get("id") or "").strip()
            key = pid or hash_text(json.dumps(sorted(post.get("images", [])), ensure_ascii=False))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            merged.append(post)
    return merged


def finalize_posts(posts: List[Dict]) -> List[Dict]:
    return [_finalize_post_meta(p) for p in posts]


def fetch_celebrity_discovery_posts(max_pages_per_uid: int) -> List[Dict]:
    buckets: List[List[Dict]] = []

    pages_uid = max(1, max_pages_per_uid)

    # 每条明星的关键词页数可与时间线分页分开（避免请求爆炸）
    kw_pages = max(1, getattr(settings, "weibo_keyword_pages", 1) or 1)

    for name in settings.weibo_celebrities:
        uid = resolve_uid_for_nickname(name)

        timeline_posts: List[Dict] = []
        search_posts: List[Dict] = []

        if uid:
            for pg in range(1, pages_uid + 1):
                timeline_posts.extend(
                    fetch_mymblog_for_uid(uid, page=pg, celebrity_hint=name)
                )
                time.sleep(0.85 + (hash(name) % 5) * 0.05)
        else:
            logger.error("未能解析昵称「%s」的微博 UID：请手动在控制台确认名称，或稍后补 UID 映射", name)

        for tag in settings.weibo_search_tags or ("美图",):
            keyword = f"{name} {tag}".strip()
            for pg in range(1, kw_pages + 1):
                search_posts.extend(
                    fetch_keyword_timeline_mobile(
                        keyword, page=pg, celebrity=name, scene=tag
                    )
                )
                time.sleep(0.95 + pg * 0.05)

        buckets.append(timeline_posts)
        buckets.append(search_posts)

    return _merge_post_lists(buckets)


def fetch_super_topic_posts(topic_name: str, *, max_pages: int = 1) -> List[Dict]:
    """从超话抓取带图片的帖子（桌面端 API）。"""
    topic_hash = resolve_super_topic_hash(topic_name)
    if not topic_hash:
        return []

    containerid = f"100808{topic_hash}"
    parsed: List[Dict] = []

    for page in range(1, max(1, max_pages) + 1):
        try:
            payload = _request_with_retry(
                url="https://weibo.com/ajax/feed/topic",
                params_list=(
                    {"containerid": containerid, "page": page, "count": 25},
                    {"containerid": containerid, "page": page},
                ),
            )
            statuses = payload.get("data", {}).get("list", []) or []
            for item in statuses:
                pt = _post_from_card(item, celebrity=topic_name, source="super_topic", scene_hint=topic_name)
                if pt:
                    parsed.append(pt)
            logger.info(
                "超话「%s」第%s页：原始帖子 %s → 含图帖子 %s",
                topic_name, page, len(statuses), len(parsed),
            )
        except Exception as err:
            logger.error("超话「%s」第%s页抓取失败：%s", topic_name, page, err)
        if page < max_pages:
            time.sleep(0.9 + (hash(topic_name) % 5) * 0.05)

    return parsed


def fetch_keyword_only_posts(tags: tuple, *, max_pages_per_tag: int = 1) -> List[Dict]:
    """直接用标签搜索，不带明星名称前缀。"""
    buckets: List[List[Dict]] = []
    for tag in tags:
        tag_posts: List[Dict] = []
        for pg in range(1, max(1, max_pages_per_tag) + 1):
            tag_posts.extend(
                fetch_keyword_timeline_mobile(tag, page=pg, celebrity="关键词搜索", scene=tag)
            )
            time.sleep(0.95 + pg * 0.05)
        buckets.append(tag_posts)
    return _merge_post_lists(buckets)


def fetch_super_topic_discovery_posts(topics: tuple, max_pages: int) -> List[Dict]:
    """遍历超话列表抓取帖子。"""
    buckets: List[List[Dict]] = []
    for topic in topics:
        buckets.append(fetch_super_topic_posts(topic, max_pages=max_pages))
    return _merge_post_lists(buckets)


def fetch_weibo_posts_paginated(max_pages: int = 1) -> List[Dict]:
    mode = resolve_weibo_fetch_mode()

    celebrities = settings.weibo_celebrities
    if mode == "own":
        logger.info("微博抓取模式: own（本人时间线）")
        return finalize_posts(fetch_own_timeline_paginated(max_pages))

    if mode == "celebrities":
        logger.info(
            "微博抓取模式: celebrities（明星聚合：%s）",
            "、".join(celebrities) if celebrities else "未配置 WEIBO_CELEBRITIES",
        )
        if not celebrities:
            logger.warning(
                "未配置 WEIBO_CELEBRITIES，celebrities 模式将回退为本人在线时间线"
            )
            return finalize_posts(fetch_own_timeline_paginated(max_pages))
        return finalize_posts(fetch_celebrity_discovery_posts(max_pages))

    if mode == "mixed":
        logger.info("微博抓取模式: mixed（明星 + 本人时间线合并）")
        parts: List[List[Dict]] = []
        if celebrities:
            parts.append(fetch_celebrity_discovery_posts(max_pages))
        parts.append(fetch_own_timeline_paginated(max_pages))
        merged = _merge_post_lists(parts)
        logger.info("mixed 模式下合并帖子数（去重后）: %s", len(merged))
        return finalize_posts(merged)

    if mode == "super_topic":
        topics = settings.weibo_super_topics
        logger.info(
            "微博抓取模式: super_topic（超话：%s）",
            "、".join(topics) if topics else "未配置 WEIBO_SUPER_TOPICS",
        )
        if not topics:
            logger.warning("未配置 WEIBO_SUPER_TOPICS，super_topic 模式无内容")
            return finalize_posts([])
        return finalize_posts(fetch_super_topic_discovery_posts(topics, max_pages))

    if mode == "keyword":
        tags = settings.weibo_search_tags
        logger.info(
            "微博抓取模式: keyword（关键词：%s）",
            "、".join(tags) if tags else "未配置 WEIBO_SEARCH_TAGS",
        )
        if not tags:
            logger.warning("未配置 WEIBO_SEARCH_TAGS，keyword 模式无内容")
            return finalize_posts([])
        return finalize_posts(fetch_keyword_only_posts(tags, max_pages_per_tag=max_pages))

    logger.info("未知的 WEIBO_FETCH_MODE，回退为 own")
    return finalize_posts(fetch_own_timeline_paginated(max_pages))
