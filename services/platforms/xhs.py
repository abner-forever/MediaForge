"""小红书平台服务 — 实现 PlatformService 协议。

小红书对内容访问有严格的登录限制：
  - 搜索页/首页内容均需登录后才可查看
  - Web API 需要 x-s/x-t 签名头（由前端 JS 动态生成）
  - 未登录时页面显示"登录后查看搜索结果"

策略：使用 Playwright 导航到搜索页面，拦截 React 应用发起的带 x-s/x-t 签名的
API 响应以提取结果。同时利用页面自身的 __INITIAL_STATE__ 作为快速路径。
"""

import time
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import quote

from config import settings
from services.platforms.base import PlatformMeta
from utils.logger import get_logger
from utils.xhs_auth_store import STORAGE_STATE_PATH

logger = get_logger(__name__)


def _normalize_xhs_url(url: str) -> str:
    """规范化小红书图片 URL，确保可代理访问。

    原始 URL 可能是 HTTP + !n 后缀（无法直接访问），
    转为 HTTPS + !nc_n_webp_mw_1（WebP 格式，可代理）。
    """
    if not url:
        return ""
    url = url.split("?")[0]
    # HTTP → HTTPS
    if url.startswith("http://"):
        url = "https://" + url[7:]
    # !n 后缀 → WebP 可访问后缀
    if url.endswith("!n"):
        url = url[:-2] + "!nc_n_webp_mw_1"
    return url


def _extract_images_from_note(note: dict) -> List[str]:
    """从笔记对象中提取原始图片 URL 列表。"""
    urls: List[str] = []

    image_list = note.get("image_list") or note.get("images") or []
    if isinstance(image_list, list):
        for img in image_list:
            if isinstance(img, dict):
                url = (
                    img.get("url_default")
                    or img.get("url")
                    or (img.get("info_list") or [{}])[0].get("url")
                    or (img.get("image") or {}).get("url")
                    or ""
                )
                url = _normalize_xhs_url(url)
                if url:
                    urls.append(url)
            elif isinstance(img, str):
                url = _normalize_xhs_url(img)
                if url:
                    urls.append(url)

    if not urls:
        cover = note.get("cover") or note.get("cover_image") or {}
        if isinstance(cover, dict):
            url = _normalize_xhs_url(cover.get("url_default") or cover.get("url") or "")
            if url:
                urls.append(url)
        elif isinstance(cover, str):
            url = _normalize_xhs_url(cover)
            if url:
                urls.append(url)

    return urls


def _post_from_note(item: dict, *, keyword: str) -> Optional[Dict]:
    """将小红书笔记对象转为标准化 Post 字典。

    兼容两种 API 格式：
      - 新：{ id, note_card: { display_title, image_list, user, ... }, xsec_token }
      - 旧：{ id, display_title, image_list, user, ... }
    """
    if not isinstance(item, dict):
        return None

    # 新格式：数据嵌套在 note_card 中
    note = item.get("note_card") or item
    if not isinstance(note, dict):
        return None

    note_id = str(item.get("id") or note.get("id") or note.get("note_id") or "")
    if not note_id:
        return None

    images = _extract_images_from_note(note)
    if not images:
        return None

    title = (note.get("display_title") or note.get("title") or "").strip()
    desc = (note.get("desc") or note.get("description") or "").strip()
    text = title or desc

    user = note.get("user") or note.get("author") or {}
    screen_name = ""
    if isinstance(user, dict):
        screen_name = (
            user.get("nickname")
            or user.get("name")
            or user.get("screen_name")
            or ""
        )

    created_at = ""
    raw_time = note.get("time") or note.get("create_time") or note.get("last_update_time") or ""
    if isinstance(raw_time, (int, float)):
        from datetime import datetime
        created_at = datetime.fromtimestamp(raw_time).isoformat() if raw_time > 1000000000 else ""
    elif isinstance(raw_time, str):
        created_at = raw_time

    return {
        "id": note_id,
        "text": text,
        "images": images,
        "celebrity": screen_name or "小红书用户",
        "source": "xhs_keyword",
        "scene": keyword,
        "screen_name": screen_name,
        "created_at": created_at,
    }


# ── Playwright 搜索 ─────────────────────────────────


def _search_with_playwright(keyword: str, page_num: int = 1) -> List[Dict]:
    """使用 Playwright 搜索小红书。

    流程：
      1. 用 Cookie 初始化浏览器
      2. 先打开首页/探索页建立会话上下文
      3. 导航到搜索页（带尾部斜杠，避免 301 重定向）
      4. 尝试从 __INITIAL_STATE__ 快速提取（登录态下 SSR 直接携带）
      5. 拦截 React 应用发起的 API 响应（带 x-s/x-t 签名）
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error("playwright 未安装，无法搜索小红书")
        return []

    cookie_str = settings.xhs_cookie
    if not cookie_str:
        logger.error("未配置小红书 Cookie")
        return []

    notes: List[Dict] = []
    browser = None

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                channel="chromium",
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
            )
            # 优先使用完整浏览器状态（含 localStorage/IndexedDB/cookie 属性），
            # 仅在未登录过时降级为 cookie 字符串
            if STORAGE_STATE_PATH.exists():
                context = browser.new_context(
                    storage_state=str(STORAGE_STATE_PATH),
                    viewport={"width": 1440, "height": 900},
                    user_agent=(
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
                    ),
                    locale="zh-CN",
                    timezone_id="Asia/Shanghai",
                )
                logger.info("使用 storage_state 恢复浏览器会话")
            else:
                context = browser.new_context(
                    viewport={"width": 1440, "height": 900},
                    user_agent=(
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
                    ),
                    locale="zh-CN",
                    timezone_id="Asia/Shanghai",
                )
                # 降级：从 cookie 字符串设置（可能丢失 Secure/HttpOnly/SameSite 属性）
                cookies_list = []
                for part in cookie_str.split(";"):
                    kv = part.strip().split("=", 1)
                    if len(kv) == 2 and kv[0].strip():
                        cookies_list.append({
                            "name": kv[0].strip(),
                            "value": kv[1].strip(),
                            "domain": ".xiaohongshu.com",
                            "path": "/",
                        })
                if cookies_list:
                    context.add_cookies(cookies_list)
                    logger.info("降级使用 add_cookies（storage_state 不可用）")

            pg = context.new_page()

            # 拦截搜索 API 响应
            search_api_responses: List[Dict[str, Any]] = []

            def on_response(resp):
                if "/api/sns/web/v1/search/notes" in resp.url:
                    try:
                        body = resp.json()
                        if isinstance(body, dict):
                            search_api_responses.append(body)
                    except Exception:
                        pass

            pg.on("response", on_response)

            # 第一步：先访问探索页建立会话（React app 初始化、安全验证通过）
            logger.info("正在初始化小红书会话…")
            try:
                pg.goto("https://www.xiaohongshu.com/explore", wait_until="domcontentloaded", timeout=20000)
                time.sleep(2.0)
            except Exception as exc:
                logger.warning("探索页加载异常: %s，继续尝试搜索", exc)

            # 第二步：导航到搜索页（使用带尾部斜杠的正确 URL）
            search_url = (
                f"https://www.xiaohongshu.com/search_result/"
                f"?keyword={quote(keyword)}"
            )
            if page_num > 1:
                search_url += f"&page={page_num}"

            pg.goto(search_url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(2.0)

            # ── 快速路径：从 Vue Pinia store 直接提取 ──
            try:
                result = pg.evaluate("""
                    () => {
                        try {
                            const st = window.__INITIAL_STATE__;
                            if (!st) return null;
                            const feeds = st.search?.feeds;
                            if (!feeds) return null;
                            const raw = feeds._rawValue || feeds._value || feeds;
                            if (Array.isArray(raw)) return raw.slice(0, 50);
                            return null;
                        } catch(e) { return null; }
                    }
                """)
                if result and isinstance(result, list):
                    for item in result:
                        note_data = item.get("note_card") or item.get("note", item) if isinstance(item, dict) else item
                        post = _post_from_note(note_data if isinstance(note_data, dict) else item, keyword=keyword)
                        if post:
                            notes.append(post)
                    if notes:
                        logger.info("SSR Pinia 提取到 %s 条笔记", len(notes))
                        browser.close()
                        browser = None
                        return notes
            except Exception as exc:
                logger.debug("SSR 提取失败: %s", exc)

            # ── 主路径：等待 API 响应拦截 ──
            for _ in range(40):
                if search_api_responses:
                    break
                try:
                    ready = pg.evaluate("document.readyState === 'complete'")
                    if ready:
                        time.sleep(3.0)
                        if search_api_responses:
                            break
                except Exception:
                    pass
                time.sleep(1.0)

            # 解析 API 响应
            for data in search_api_responses:
                if data.get("success"):
                    items = []
                    raw_data = data.get("data")
                    if isinstance(raw_data, dict):
                        items = raw_data.get("items", [])
                    elif isinstance(raw_data, list):
                        items = raw_data
                    else:
                        items = data.get("items", [])

                    if not isinstance(items, list):
                        items = []

                    for item in items:
                        note_data = item.get("note", item) if isinstance(item, dict) else item
                        post = _post_from_note(note_data, keyword=keyword)
                        if post:
                            notes.append(post)

                    if notes:
                        logger.info("API 拦截搜索「%s」第%s页成功，获取 %s 条笔记", keyword, page_num, len(notes))
                        break
                else:
                    msg = data.get("msg", "") or ""
                    if "权限" in msg or "登录" in msg or "auth" in msg.lower():
                        logger.warning(
                            "小红书搜索「%s」失败：%s（Cookie 可能已过期）",
                            keyword, msg,
                        )

            # 检测过期情况
            if not notes:
                try:
                    page_text = pg.evaluate("document.body.innerText")
                    if "登录" in (page_text or ""):
                        logger.warning("小红书搜索「%s」需要登录：页面显示登录提示", keyword)
                except Exception:
                    pass

            browser.close()
            browser = None

    except Exception as err:
        logger.error("Playwright 搜索小红书失败: %s", err)
    finally:
        if browser:
            try:
                browser.close()
            except Exception:
                pass

    return notes


# ── 搜索入口 ──────────────────────────────────────────


def search_keyword(
    keyword: str,
    *,
    page: int = 1,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> List[Dict]:
    """搜索小红书关键词，返回标准化帖子列表。"""
    if progress_callback:
        progress_callback(f"正在搜索小红书「{keyword}」…")
    return _search_with_playwright(keyword, page_num=page)


# ── PlatformService 实现 ─────────────────────────────


class XHSService:
    meta = PlatformMeta(
        id="xhs",
        name="小红书",
        auth_fields=["cookie"],
        fetch_modes={
            "keyword": "关键词搜索",
        },
        default_fetch_mode="keyword",
        search_params_description="从小红书搜索图文内容",
    )

    @staticmethod
    def check_auth() -> bool:
        return bool(settings.xhs_cookie)

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
        """按指定模式抓取小红书帖子。仅支持 keyword 模式。"""
        if mode != "keyword":
            logger.warning("小红书仅支持 keyword 模式，当前模式: %s", mode)
            if progress_callback:
                progress_callback("⚠ 小红书仅支持关键词搜索模式")
            return []

        tags = search_tags if search_tags is not None else list(settings.xhs_search_tags)
        if not tags:
            logger.warning("未配置搜索关键词")
            if progress_callback:
                progress_callback("⚠ 请先在小红书设置中配置搜索关键词")
            return []

        pages = [specific_page] if specific_page > 0 else range(1, max(1, max_pages) + 1)

        all_posts: List[Dict] = []
        seen_ids: set = set()

        for tag in tags:
            tag = tag.strip()
            if not tag:
                continue

            for pg in pages:
                if progress_callback:
                    progress_callback(f"正在搜索小红书「{tag}」…")
                try:
                    posts = search_keyword(tag, page=pg, progress_callback=progress_callback)
                    if not posts:
                        logger.info("小红书「%s」第%s页: 无结果", tag, pg)
                        if progress_callback:
                            progress_callback(
                                "⚠ 小红书搜索无结果，常见原因：\n"
                                "1. Cookie 已过期 → 请到「设置 → 媒体来源 → 小红书」重新登录\n"
                                "2. 小红书搜索要求登录且会话有效期较短"
                            )
                        continue

                    before = len(all_posts)
                    for p in posts:
                        pid = str(p.get("id") or "")
                        if pid and pid in seen_ids:
                            continue
                        if pid:
                            seen_ids.add(pid)
                        all_posts.append(p)
                    new_count = len(all_posts) - before
                    if progress_callback:
                        progress_callback(f"✓ 小红书「{tag}」第{pg}页 → {new_count} 条含图笔记")
                    logger.info("小红书「%s」第%s页: %s 条新笔记", tag, pg, new_count)
                except Exception as err:
                    logger.error("小红书搜索「%s」第%s页失败: %s", tag, pg, err)
                    if progress_callback:
                        progress_callback(f"✗ 小红书「{tag}」第{pg}页失败: {err}")

                if pg < max(pages):
                    time.sleep(1.5)

        return all_posts
