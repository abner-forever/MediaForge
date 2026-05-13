"""今日头条平台服务 — 实现 PlatformService 协议。

API 策略：
  - 关键词搜索: so.toutiao.com/search?pd=atlas (图文模式，rawJSON=1)
  - 推荐流: 兜底回退到关键词搜索（签名参数复杂，不做 JS 逆向）
  - 用户主页: 优先尝试 PC 端 /c/user/article/，回退到关键词搜索
"""

import re
import time
from typing import Callable, Dict, List, Optional

import requests

from config import settings
from services.platforms.base import PlatformMeta
from utils.logger import get_logger

logger = get_logger(__name__)

# ── HTTP 工具函数 ──────────────────────────────────


def _json_headers() -> dict:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
        ),
        "Cookie": settings.toutiao_cookie,
        "Referer": "https://www.toutiao.com/",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }


def _mobile_headers() -> dict:
    """移动端 API 请求头（反爬较弱）。"""
    return {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
        ),
        "Cookie": settings.toutiao_cookie,
        "Referer": "https://m.toutiao.com/",
        "Accept": "application/json, text/plain, */*",
    }


def _request_json(
    url: str,
    params: Optional[Dict] = None,
    *,
    mobile: bool = False,
    timeout: Optional[int] = None,
) -> Optional[dict]:
    """带重试的 JSON GET 请求。"""
    headers = _mobile_headers() if mobile else _json_headers()
    t = timeout or settings.request_timeout
    last_err = None
    for i in range(max(1, settings.retry_times)):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=t)
            resp.raise_for_status()
            return resp.json()
        except Exception as err:
            last_err = err
            logger.error("头条请求失败(第%s次): %s %s", i + 1, url, err)
            time.sleep(1.5 * (i + 1))
    logger.error("头条请求最终失败: %s %s", url, last_err)
    return None


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "").replace("&nbsp;", " ").strip()


# ── 图片解析 ────────────────────────────────────────


def _extract_images(item: dict) -> List[str]:
    """从搜索结果项中提取图片 URL 列表。

    头条不同 API 返回的图片字段不同，依次尝试以下来源：
      1. image_list  — 标准多图列表（部分接口返回数组）
      2. all_image_list — 全部图片（部分图集接口）
      3. img_url / large_img_url — 单张封面图
    """
    urls: List[str] = []

    # 1) image_list — 多图列表
    image_list = item.get("image_list") or item.get("all_image_list") or []
    if isinstance(image_list, list):
        for img_item in image_list:
            if isinstance(img_item, dict):
                url = img_item.get("url") or img_item.get("img_url") or ""
            elif isinstance(img_item, str):
                url = img_item
            else:
                continue
            if url.startswith("http"):
                # 头条图片 URL 通常以 list/tos 开头，去掉 query 参数获得原图
                clean = url.split("?")[0]
                if clean not in urls:
                    urls.append(clean)

    # 2) 单张封面图（如仍未获取到）
    if not urls:
        for key in ("large_img_url", "img_url"):
            val = item.get(key)
            if isinstance(val, str) and val.startswith("http"):
                urls.append(val.split("?")[0])
                break

    # 3) 标题图兜底
    if not urls:
        thumb = item.get("thumb_url") or item.get("middle_img_url") or ""
        if isinstance(thumb, str) and thumb.startswith("http"):
            urls.append(thumb.split("?")[0])

    return urls


def _post_from_item(
    item: dict,
    *,
    celebrity: str,
    source: str,
    scene: str = "",
) -> Optional[Dict]:
    """将头条 API 返回的 item 转为标准化 Post 字典。

    头条搜图 API 结构:
      - text: 标题
      - img_url: 单张图片 URL
      - original_page_url: http://m.toutiao.com/group/{group_id}/
      - info.publish_time: Unix 时间戳
    """
    images = _extract_images(item)
    if not images:
        return None

    # group_id 从 original_page_url 中提取
    page_url = item.get("original_page_url") or ""
    group_id = ""
    if isinstance(page_url, str):
        m = re.search(r"group/(\d+)", page_url)
        if m:
            group_id = m.group(1)
    if not group_id:
        group_id = str(item.get("id") or item.get("group_id") or item.get("item_id") or "")

    text = (item.get("text") or item.get("title") or "").strip()
    text = _strip_html(text)
    text = re.sub(r"…+$", "", text).strip()
    if not text:
        text = f"#{scene} 图片" if scene else "头条图片"

    author = celebrity or "头条用户"

    info = item.get("info", {})
    if not isinstance(info, dict):
        info = {}
    created_at = info.get("publish_time") or item.get("datetime") or item.get("publish_time") or ""
    if isinstance(created_at, (int, float)):
        from datetime import datetime

        created_at = datetime.fromtimestamp(created_at).isoformat()

    return {
        "id": group_id,
        "text": text,
        "images": images,
        "celebrity": celebrity,
        "source": source,
        "scene": scene or "推荐",
        "screen_name": author,
        "created_at": str(created_at) if created_at else "",
    }


# ── 关键词搜索 API ───────────────────────────────────


def _search_posts(
    keyword: str,
    *,
    page: int = 1,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> List[Dict]:
    """通过头条搜索 API 获取关键词的图文结果。

    优先使用 pd=image（纯图片模式），返回的数据包含更丰富的图片信息；
    降级到 pd=atlas（图文资讯模式）。两者搭配覆盖更多高质量图片。
    """
    url = "https://so.toutiao.com/search"
    parsed: List[Dict] = []

    # 按优先级尝试不同的搜索模式
    for pd_mode in ("image", "atlas"):
        params = {
            "keyword": keyword,
            "pd": pd_mode,
            "page_num": page - 1,  # 头条从 0 开始
            "rawJSON": "1",
        }
        payload = _request_json(url, params=params)
        if not payload:
            continue

        raw_data = payload.get("rawData", {})
        if not isinstance(raw_data, dict):
            raw_data = {}
        items: List = raw_data.get("data", [])
        if not isinstance(items, list):
            items = []

        for item in items:
            if not isinstance(item, dict):
                continue
            # 跳过已解析的重复项
            item_id = str(item.get("id") or item.get("group_id") or item.get("item_id") or "")
            if any(p.get("id") == item_id for p in parsed):
                continue
            pt = _post_from_item(
                item,
                celebrity="关键词搜索",
                source=f"toutiao_keyword",
                scene=keyword,
            )
            if pt:
                parsed.append(pt)

        logger.info(
            "头条搜图[%s]「%s」第%s页: %s 条原始 → %s 条含图",
            pd_mode, keyword, page, len(items), len(parsed),
        )
        if progress_callback:
            progress_callback(f"✓ 搜索({pd_mode})「{keyword}」第{page}页 → 累计 {len(parsed)} 条")

        # image 模式结果够多就不再请求 atlas
        if len(parsed) >= 15:
            break

    return parsed


# ── 推荐流 API（兜底策略）─────────────────────────


def _feed_posts(
    max_pages: int,
    *,
    specific_page: int = 0,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> List[Dict]:
    """获取推荐流内容。

    优先尝试 PC feed API（可能因签名参数失败），
    失败时使用已配置的搜索标签做关键词搜索作为降级。
    """
    tags = settings.toutiao_search_tags or ("时尚", "明星", "穿搭")

    # 指定页码时跳过 feed API，直接关键词搜索该页
    if specific_page > 0:
        if progress_callback:
            progress_callback(f"正在搜索推荐标签（第{specific_page}页）…")
        buckets: List[List[Dict]] = []
        for tag in tags:
            fetched = _search_posts(tag, page=specific_page, progress_callback=progress_callback)
            buckets.append(fetched)
            time.sleep(0.8)
        return _merge_posts(buckets)

    if progress_callback:
        progress_callback("正在获取头条推荐流…")

    # 尝试 feed API（无签名仅做试探）
    feed_url = "https://www.toutiao.com/api/pc/feed/"
    params = {
        "category": "all",
        "utm_source": "toutiao",
        "widen": "1",
        "max_behot_time": "0",
        "tadrequire": "true",
    }
    feed_result = _request_json(feed_url, params=params, timeout=8)

    if feed_result and feed_result.get("data"):
        items = feed_result.get("data", [])
        logger.info("头条推荐流 API 返回 %s 条", len(items))
        parsed = []
        for item in items:
            pt = _post_from_item(item, celebrity="推荐流", source="toutiao_feed", scene="推荐")
            if pt:
                parsed.append(pt)
        if parsed:
            return parsed[:50]

    # feed API 失败，兜底到关键词搜索
    logger.info("头条推荐流 API 回退到关键词搜索")
    if progress_callback:
        progress_callback("推荐流接口暂不可用，使用关键词搜索作为代替…")

    buckets: List[List[Dict]] = []
    for tag in tags:
        if progress_callback:
            progress_callback(f"正在搜索推荐标签「{tag}」…")
        for pg in range(1, min(max_pages, 2) + 1):
            fetched = _search_posts(tag, page=pg, progress_callback=progress_callback)
            buckets.append(fetched)
            time.sleep(0.8)
    # 去重合并
    return _merge_posts(buckets)


# ── 用户主页 API ────────────────────────────────────


def _user_posts(
    max_pages: int,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> List[Dict]:
    """获取指定用户的文章列表。"""
    user_id = settings.toutiao_user_id
    if not user_id:
        logger.warning("未配置 TOUTIAO_USER_ID，无法获取用户主页")
        if progress_callback:
            progress_callback("请先配置 TOUTIAO_USER_ID")
        return []

    if progress_callback:
        progress_callback(f"正在获取用户主页({user_id})…")

    # 尝试 PC 端 API
    url = "https://www.toutiao.com/c/user/article/"
    params = {
        "page_type": "1",  # 图文
        "user_id": user_id,
        "max_behot_time": "0",
        "count": "20",
    }
    payload = _request_json(url, params=params, timeout=10)

    if payload and payload.get("data"):
        items = payload["data"]
        if isinstance(items, list):
            parsed = []
            for item in items:
                pt = _post_from_item(
                    item,
                    celebrity="",
                    source="toutiao_user",
                    scene="用户主页",
                )
                if pt:
                    parsed.append(pt)
            logger.info("头条用户主页 API 返回 %s 条", len(parsed))
            return parsed

    # 尝试移动端 API（反爬较弱）
    if progress_callback:
        progress_callback("尝试移动端接口…")
    mobile_url = "https://www.toutiao.com/pgc/ma/"
    mobile_params = {
        "page_type": "1",
        "max_behot_time": "0",
        "uid": user_id,
        "media_id": user_id,
        "output": "json",
        "is_json": "1",
        "count": "20",
        "from": "user_profile_app",
        "version": "2",
    }
    mobile_payload = _request_json(mobile_url, params=mobile_params, mobile=True, timeout=10)
    if mobile_payload:
        data = mobile_payload.get("data", []) or []
        if isinstance(data, list):
            parsed = []
            for item in data:
                item_data = item.get("content", {}) if isinstance(item, dict) and "content" in item else item
                pt = _post_from_item(
                    item_data if isinstance(item_data, dict) else item,
                    celebrity="",
                    source="toutiao_user_mobile",
                    scene="用户主页",
                )
                if pt:
                    parsed.append(pt)
            logger.info("头条移动端用户 API 返回 %s 条", len(parsed))
            return parsed

    logger.warning("用户主页 API 均未返回数据，请检查 TOUTIAO_COOKIE 和 TOUTIAO_USER_ID 是否有效")
    if progress_callback:
        progress_callback("用户主页获取失败，请检查 Cookie 和用户 ID 配置")
    return []


# ── 去重合并 ────────────────────────────────────────


def _merge_posts(groups: List[List[Dict]]) -> List[Dict]:
    """合并多个帖子列表，按 id 去重。"""
    seen: set = set()
    merged: List[Dict] = []
    for grp in groups:
        for post in grp:
            pid = str(post.get("id") or "")
            if pid and pid in seen:
                continue
            if pid:
                seen.add(pid)
            merged.append(post)
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
    else:
        out["scene"] = "日常"
    return out


def finalize_posts(posts: List[Dict]) -> List[Dict]:
    """标准化帖子列表。"""
    return [_finalize_post_meta(p) for p in posts]


# ── PlatformService 实现 ────────────────────────────


class ToutiaoService:
    meta = PlatformMeta(
        id="toutiao",
        name="今日头条",
        auth_fields=["cookie", "user_id"],
        fetch_modes={
            "feed": "推荐流",
            "user": "用户主页",
            "keyword": "关键词搜索",
        },
        default_fetch_mode="keyword",
        search_params_description="通过今日头条搜索图文内容",
    )

    @staticmethod
    def check_auth() -> bool:
        return bool(settings.toutiao_cookie)

    @staticmethod
    def fetch_posts(
        mode: str,
        *,
        max_pages: int = 1,
        specific_page: int = 0,
        celebrities: Optional[List[str]] = None,
        search_tags: Optional[List[str]] = None,
        super_topics: Optional[List[str]] = None,
        progress_callback: Optional[Callable[[str], None]] = None,
    ) -> List[Dict]:
        """按指定模式抓取今日头条帖子，返回标准化 Post 字典列表。

        specific_page > 0 时仅获取该页数据（代替 max_pages 控制的循环）。
        """
        resolved = mode or ToutiaoService.meta.default_fetch_mode

        if progress_callback:
            progress_callback(f"正在连接今日头条（{resolved} 模式）…")

        logger.info("平台: 今日头条, 模式: %s", resolved)

        try:
            if resolved == "feed":
                posts = _feed_posts(max_pages, specific_page=specific_page, progress_callback=progress_callback)
            elif resolved == "user":
                posts = _user_posts(max_pages, progress_callback)
            elif resolved == "keyword":
                posts = _keyword_posts(max_pages, specific_page=specific_page, progress_callback=progress_callback)
            else:
                logger.warning("未知今日头条模式 %s", resolved)
                return []
            return finalize_posts(posts)
        except Exception as err:
            logger.error("今日头条抓取失败: %s", err)
            if progress_callback:
                progress_callback(f"✗ 抓取失败: {err}")
            return []


def _keyword_posts(
    max_pages: int,
    *,
    specific_page: int = 0,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> List[Dict]:
    """用配置的搜索标签逐一搜索。"""
    tags = settings.toutiao_search_tags or ("时尚", "明星", "穿搭")
    buckets: List[List[Dict]] = []
    pages = [specific_page] if specific_page > 0 else range(1, max(1, max_pages) + 1)

    for tag in tags:
        if progress_callback:
            progress_callback(f"正在搜索「{tag}」…")
        for pg in pages:
            fetched = _search_posts(tag, page=pg, progress_callback=progress_callback)
            buckets.append(fetched)
            time.sleep(0.8 + pg * 0.05)

    return _merge_posts(buckets)
