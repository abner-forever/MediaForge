"""从微信公众号后台抓取已发布文章的真实阅读数据。"""

import difflib
import json
import re
from datetime import datetime
from queue import Queue
from typing import Any, Dict, Optional

# 艺人名分隔符：中文全角 ｜、英文半角 |、中文顿号、中划线
_CELEB_SEP_RE = re.compile(r"\s*[｜|]\s*")

from playwright.sync_api import sync_playwright

from config import DATA_DIR
from utils.logger import get_logger

from services.wechat.helpers import (
    _cleanup_stale_lock,
    _extract_token_from_url,
    _human_sleep,
    _looks_logged_in,
)

logger = get_logger(__name__)


def fetch_published_articles(
    account_id: str,
    msg_queue: Queue,
    pages: int = 1,
    page_size: int = 20,
) -> None:
    """抓取公众号已发布文章列表及其阅读数据。

    Args:
        pages: 拉取页数，默认 1 页。
        page_size: 每页条数，默认 20。

    通过 msg_queue 推送进度：
      - ("progress", str)   进度消息
      - ("done", dict)      完成，含 synced/total
      - ("error", str)      错误
    """
    from utils.wechat_auth_store import get_account_paths, update_account

    # 防御：SSE 框架可能把参数包装成 list
    logger.info("fetch_published_articles 收到 pages 参数: %r (type=%s)", pages, type(pages).__name__)
    if isinstance(pages, (list, tuple)):
        pages = int(pages[0]) if pages else 1
    pages = max(1, min(50, int(pages)))
    logger.info("pages 最终值: %d", pages)

    profile_dir, state_path = get_account_paths(account_id)
    if not profile_dir.exists():
        msg_queue.put(("error", "该账号尚未登录，请先登录公众号"))
        return

    def _emit(msg: str) -> None:
        msg_queue.put(("progress", msg))

    try:
        _cleanup_stale_lock(profile_dir)
        with sync_playwright() as p:
            # 启动浏览器，遇到 SingletonLock 错误时重试一次
            context = None
            for attempt in range(2):
                try:
                    context = p.chromium.launch_persistent_context(
                        user_data_dir=str(profile_dir),
                        headless=True,
                        channel="chromium",
                    )
                    break
                except Exception as launch_err:
                    if "ProcessSingleton" in str(launch_err) or "SingletonLock" in str(launch_err):
                        logger.warning("浏览器启动失败（SingletonLock），重试清理: %s", launch_err)
                        _cleanup_stale_lock(profile_dir)
                        import time; time.sleep(0.5)
                        continue
                    raise
            if context is None:
                msg_queue.put(("error", "浏览器启动失败，锁文件无法清除，请手动关闭所有 Chrome 进程后重试"))
                return
            browser_pages = context.pages
            page = browser_pages[0] if browser_pages else context.new_page()
            page.goto("https://mp.weixin.qq.com/", wait_until="domcontentloaded")
            _emit("正在检查登录状态...")

            if not _looks_logged_in(page):
                context.close()
                msg_queue.put(("error", "登录已失效，请先在微信配置中重新登录"))
                return
            _emit("登录成功，开始分页拉取文章数据...")

            token = _extract_token_from_url(page.url or "")
            if not token:
                page.goto("https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN", wait_until="domcontentloaded")
                _human_sleep(2.0, 1.0)
                token = _extract_token_from_url(page.url or "")

            if not token:
                msg_queue.put(("error", "无法获取 token，请确认公众号后台已正常登录"))
                context.close()
                return

            # 分页拉取全部已发布文章
            all_articles: list = []
            begin = 0
            total_count = None

            while True:
                api_url = (
                    f"https://mp.weixin.qq.com/cgi-bin/appmsgpublish"
                    f"?sub=list&begin={begin}&count={page_size}"
                    f"&query=&token={token}&lang=zh_CN&f=json&ajax=1"
                )
                _emit(f"正在获取第 {begin + 1}~{begin + page_size} 篇...")
                logger.info("请求公众号 API: %s", api_url)
                resp = page.request.get(api_url)

                if not resp.ok:
                    logger.error("API HTTP 错误: %s %s", resp.status, resp.status_text)
                    if not all_articles:
                        msg_queue.put(("error", f"API 请求失败: HTTP {resp.status}"))
                        context.close()
                        return
                    break

                data = resp.json()
                base_resp = data.get("base_resp", {})
                if base_resp.get("ret") != 0:
                    if not all_articles:
                        msg_queue.put(("error", f"API 返回错误: {base_resp.get('err_msg', '未知')}"))
                        context.close()
                        return
                    break

                # 解析嵌套 JSON：publish_page → publish_list → publish_info → appmsg_info
                articles = _parse_articles(data)

                # 首次获取 total_count
                if total_count is None:
                    try:
                        pp = json.loads(data.get("publish_page", "{}")) if isinstance(data.get("publish_page"), str) else data.get("publish_page", {})
                        total_count = pp.get("total_count", 0)
                        publish_count = pp.get("publish_count", 0)
                        logger.info("total_count=%d, publish_count=%d, 本页 publish_list 条数=%d, 解析出文章=%d",
                                    total_count, publish_count, len(pp.get("publish_list", [])), len(articles))
                    except (json.JSONDecodeError, TypeError):
                        total_count = 0

                if not articles:
                    break

                all_articles.extend(articles)
                _emit(f"已获取 {len(all_articles)}/{total_count or '?'} 篇")

                # 翻页
                begin += page_size
                current_page = begin // page_size
                if current_page >= pages:
                    break
                if total_count and begin >= total_count:
                    break

                _human_sleep(0.5, 0.3)

            _emit(f"拉取完成，共 {len(all_articles)} 篇文章")

            if not all_articles:
                msg_queue.put(("done", {"synced": 0, "total": 0}))
                context.close()
                return

            # 匹配并更新本地效果数据
            synced = _match_and_update(all_articles, _emit)

            # 持久化 storage state
            try:
                context.storage_state(path=str(state_path))
                update_account(account_id, last_used=datetime.now().isoformat())
            except Exception:
                pass
            context.close()

        msg_queue.put(("done", {"synced": synced, "total": len(all_articles)}))

    except Exception as e:
        logger.exception("抓取公众号文章数据失败")
        msg_queue.put(("error", str(e)))


def _parse_articles(data: dict) -> list:
    """从 API 响应中解析文章列表。publish_page / publish_info 都是 JSON 字符串。"""
    articles = []
    publish_page_raw = data.get("publish_page", "")
    if not publish_page_raw:
        return articles
    try:
        publish_page = json.loads(publish_page_raw) if isinstance(publish_page_raw, str) else publish_page_raw
    except (json.JSONDecodeError, TypeError):
        logger.warning("解析 publish_page 失败")
        return articles

    for pub in publish_page.get("publish_list", []):
        info_raw = pub.get("publish_info", "")
        try:
            info = json.loads(info_raw) if isinstance(info_raw, str) else info_raw
        except (json.JSONDecodeError, TypeError):
            continue
        for appmsg in info.get("appmsg_info", []):
            # 发布时间在 line_info.send_time（秒级时间戳），create_time 通常为 0
            if not appmsg.get("create_time"):
                line_info = appmsg.get("line_info") or {}
                appmsg["create_time"] = line_info.get("send_time") or info.get("create_time") or 0

            articles.append(appmsg)
    return articles


def _match_and_update(articles: list, _emit) -> int:
    """将公众号文章与本地队列匹配，增量更新 publish_effects（只增不减）。"""
    from desktop.app_state import app_state

    effects = app_state.get_publish_effects()
    queue = app_state.get_queue()

    # 构建本地标题 → item_id 映射
    title_to_id: Dict[str, str] = {}
    for item in queue:
        t = (item.get("title") or "").strip()
        if t and item.get("id"):
            title_to_id[t] = item["id"]

    synced = 0
    for art in articles:
        mp_title = (art.get("Title") or art.get("title") or "").strip()
        appmsgid = art.get("appmsgid") or art.get("app_msg_id") or ""
        if not mp_title:
            continue

        reads = art.get("read_num", 0) or 0
        likes = art.get("old_like_num", 0) or 0  # old_like_num=点赞数, like_num=推荐数(在看)
        recommends = art.get("like_num", 0) or 0  # like_num=推荐数(在看)
        share = art.get("share_num", 0) or art.get("share", 0) or 0

        # 发布时间：line_info.send_time（秒级时间戳），create_time 通常为 0
        create_time = art.get("create_time", 0)

        publish_time = ""
        if create_time:
            try:
                publish_time = datetime.fromtimestamp(int(create_time)).isoformat(timespec="seconds")
            except (ValueError, OSError):
                pass

        # 统一用 mp:{appmsgid} 作为 key，匹配信息单独记录
        key = f"mp:{appmsgid}" if appmsgid else f"mp:{hash(mp_title)}"
        matched_id = _find_match(mp_title, title_to_id)

        # 增量更新：只增不减
        existing = effects.get(key, {})
        update_data: Dict[str, Any] = {
            "reads": max(reads, existing.get("reads", 0)),
            "likes": max(likes, existing.get("likes", 0)),
            "recommendations": max(recommends, existing.get("recommendations", 0)),
            "shares": max(share, existing.get("shares", 0)),
            "title": mp_title,
            "source_platform": "wechat_mp",
            "content_type": "article",
        }
        if publish_time:
            update_data["publish_time"] = publish_time
        if matched_id:
            update_data["matched_queue_id"] = matched_id

        # 从标题提取艺人名（不覆盖已有的）
        celebrity = _extract_celebrity(mp_title)
        if celebrity and not existing.get("celebrity"):
            update_data["celebrity"] = celebrity
        elif existing.get("celebrity"):
            update_data["celebrity"] = existing["celebrity"]

        # 保存原始链接、封面、留言数
        content_url = art.get("content_url") or art.get("link") or ""
        if content_url:
            update_data["content_url"] = content_url
        cover = art.get("cover") or ""
        if cover:
            update_data["cover"] = cover
        comment_num = art.get("comment_num", 0) or 0
        if comment_num:
            update_data["comment_num"] = comment_num

        app_state.update_publish_effect(key, update_data)
        synced += 1
        time_str = publish_time[:10] if publish_time else "未知"
        _emit(f"{'✓' if matched_id else '→'} {mp_title}  阅读 {update_data['reads']}  {time_str}")

    return synced


def _find_match(mp_title: str, title_to_id: Dict[str, str]) -> Optional[str]:
    """标题匹配：精确 → 模糊（阈值 0.85）。"""
    if not mp_title:
        return None

    # 精确匹配
    if mp_title in title_to_id:
        return title_to_id[mp_title]

    # 模糊匹配
    best_ratio = 0.0
    best_id = None
    for local_title, item_id in title_to_id.items():
        ratio = difflib.SequenceMatcher(None, mp_title, local_title).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_id = item_id

    if best_ratio >= 0.85:
        return best_id
    return None


def _extract_celebrity(title: str) -> str:
    """从标题中提取艺人名，支持 '孙怡 | 描述' 或 '孙怡 ｜ 描述' 格式。"""
    if not title:
        return ""
    parts = _CELEB_SEP_RE.split(title, maxsplit=1)
    if len(parts) >= 2:
        name = parts[0].strip()
        # 艺人名一般不超过 10 个字，且不含数字/特殊符号
        if name and len(name) <= 10 and not re.search(r"[\d@#]", name):
            return name
    return ""
