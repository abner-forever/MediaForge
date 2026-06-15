"""文章发布 API 路由。"""

from __future__ import annotations

import re
import sys
import threading
from pathlib import Path
from typing import List, Optional

import requests as http_requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DOWNLOAD_DIR, TEXT_DIR, settings
from desktop.app_state import app_state
from desktop.api_helpers import (
    ArticleChatRequest,
    ArticleCreateRequest,
    ArticleGenerateRequest,
    ArticlePublishRequest,
    ArticleUpdateRequest,
    IMAGE_EXT,
    _req_logger,
    friendly_error_message,
    img_rel,
)
from services.ai import (
    chat_article,
    de_ai_article,
    generate_article,
    generate_article_title,
    generate_article_title_candidates,
    optimize_layout,
    polish_article,
)
from services.ai.content import _build_chat_prompt
from desktop.sse_helpers import create_sse_response
from services.extensions import build_html
from desktop.routers.images import get_proxy_cache

router = APIRouter(tags=["articles"])


@router.get("/api/articles")
async def list_articles(status: Optional[str] = Query(None)):
    """列出文章，可按状态筛选。"""
    return {"articles": app_state.get_articles(status)}


@router.post("/api/articles")
async def create_article(req: ArticleCreateRequest):
    """创建新文章。"""
    article = app_state.add_article(req.model_dump())
    app_state.add_operation("创建文章", f"「{article['title'] or '无标题'}」")
    return {"success": True, "article": article}


@router.get("/api/articles/inspiration")
async def get_inspiration(keyword: str = Query("", description="搜索关键词")):
    """从平台搜索热点话题作为灵感。"""
    if not keyword:
        return {"topics": []}

    topics = []
    try:
        from services.platforms import get_platform
        platform = get_platform("weibo")
        if platform:
            posts = platform.fetch_posts(mode="keyword", max_pages=1, search_tags=[keyword])
            for p in posts[:20]:
                text = p.get("text", "").strip()
                if text and len(text) > 5:
                    topics.append({
                        "text": text[:100],
                        "source": "weibo",
                        "celebrity": p.get("celebrity", ""),
                        "screen_name": p.get("screen_name", ""),
                    })
    except Exception as e:
        _req_logger.error("获取灵感失败: %s", e)

    if not topics:
        try:
            from services.platforms import get_platform
            platform = get_platform("toutiao")
            if platform:
                posts = platform.fetch_posts(mode="keyword", max_pages=1, search_tags=[keyword])
                for p in posts[:20]:
                    text = p.get("text", "").strip()
                    if text and len(text) > 5:
                        topics.append({
                            "text": text[:100],
                            "source": "toutiao",
                            "celebrity": p.get("celebrity", ""),
                            "screen_name": p.get("screen_name", ""),
                        })
        except Exception as e:
            _req_logger.error("头条获取灵感失败: %s", e)

    return {"topics": topics}


@router.get("/api/articles/cover-search")
async def article_cover_search(keyword: str = Query("")):
    """搜索配图：本地素材 + 网络图片。"""
    images: list[dict] = []
    seen = set()

    # 1) 本地素材搜索
    root = DOWNLOAD_DIR.expanduser().resolve()
    if root.exists():
        kw = keyword.lower()
        for path in root.rglob("*"):
            if len(images) >= 50:
                break
            if not path.is_file() or path.suffix.lower() not in IMAGE_EXT:
                continue
            rel = path.relative_to(root).as_posix()
            if kw and kw not in rel.lower():
                continue
            images.append({
                "path": rel,
                "name": path.name,
                "source": "local",
                "celebrity": rel.split("/")[0] if "/" in rel else "",
            })
            seen.add(rel)

    # 2) 网络搜索 (百度图片)
    if keyword:
        try:
            from urllib.parse import quote as _url_quote, unquote as _unquote
            resp = http_requests.get(
                "https://image.baidu.com/search/acjson",
                params={
                    "tn": "resultjson_com",
                    "logid": "1234567890",
                    "ipn": "rj",
                    "ct": "201326592",
                    "is": "",
                    "fp": "result",
                    "fr": "",
                    "word": keyword,
                    "queryWord": keyword,
                    "cl": "2",
                    "lm": "-1",
                    "ie": "utf-8",
                    "oe": "utf-8",
                    "adpicid": "",
                    "st": "-1",
                    "z": "",
                    "ic": "",
                    "hd": "",
                    "latest": "",
                    "copyright": "",
                    "s": "",
                    "se": "",
                    "tab": "",
                    "width": "",
                    "height": "",
                    "face": "0",
                    "istype": "2",
                    "qc": "",
                    "nc": "1",
                    "expermode": "",
                    "nojc": "",
                    "isAsync": "",
                    "pn": "0",
                    "rn": "30",
                    "gsm": "1e",
                },
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    ),
                    "Accept": "application/json",
                    "Referer": f"https://image.baidu.com/search/index?tn=baiduimage&word={_url_quote(keyword)}",
                },
                timeout=15,
            )
            data = resp.json()
            for item in data.get("data", []):
                if len(images) >= 60:
                    break
                url = item.get("thumbURL") or item.get("middleURL") or ""
                if not url or not url.startswith("http") or url in seen:
                    continue
                seen.add(url)
                name = item.get("fromPageTitleEnc") or item.get("title", "")
                if not name:
                    name = url.rsplit("/", 1)[-1][:50]
                else:
                    try:
                        name = _unquote(name)
                    except Exception:
                        pass
                    name = re.sub(r"<[^>]+>", "", name)[:50]
                images.append({"path": url, "name": name, "source": "web", "celebrity": ""})
        except Exception as e:
            _req_logger.warning("网络配图搜索失败: %s", e)

    return {"images": images}


from pydantic import BaseModel


class _CoverDownloadRequest(BaseModel):
    url: str


@router.post("/api/articles/cover-download")
async def article_cover_download(req: _CoverDownloadRequest):
    """下载网络图片到本地缓存目录。"""
    from uuid import uuid4
    from PIL import Image as PILImage
    from io import BytesIO

    url = req.url
    if not url:
        raise HTTPException(400, "缺少图片 URL")

    covers_dir = DOWNLOAD_DIR / "__covers__"
    covers_dir.mkdir(parents=True, exist_ok=True)

    _proxy_cache_get, _proxy_cache_set = get_proxy_cache()
    cached_data, _ = _proxy_cache_get(url)
    if cached_data:
        filename = f"{uuid4().hex}.jpg"
        local_path = covers_dir / filename
        try:
            img = PILImage.open(BytesIO(cached_data))
            if img.mode != "RGB":
                img = img.convert("RGB")
            if img.width > 1200:
                ratio = 1200 / img.width
                new_size = (1200, int(img.height * ratio))
                img = img.resize(new_size, PILImage.LANCZOS)
            img.save(local_path, "JPEG", quality=85, optimize=True)
            img.close()
        except Exception as e:
            _req_logger.debug("缓存图片处理失败，使用原始数据: %s", e)
            local_path.write_bytes(cached_data)
        rel = local_path.relative_to(DOWNLOAD_DIR).as_posix()
        return {"success": True, "path": rel}

    try:
        resp = http_requests.get(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                "Referer": "https://image.baidu.com/",
            },
            timeout=30,
            stream=True,
        )
        resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "")
        if not content_type.startswith("image/"):
            raise HTTPException(400, f"下载地址返回的不是图片 (Content-Type: {content_type})")

        content_length = resp.headers.get("Content-Length")
        if content_length and int(content_length) > 5 * 1024 * 1024:
            raise HTTPException(413, "图片过大（超过 5MB），请选择其他配图")

        filename = f"{uuid4().hex}.jpg"
        local_path = covers_dir / filename

        temp_path = local_path.with_suffix(".tmp")
        with temp_path.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)

        try:
            img = PILImage.open(temp_path)
            if img.mode != "RGB":
                img = img.convert("RGB")
            if img.width > 1200:
                ratio = 1200 / img.width
                new_size = (1200, int(img.height * ratio))
                img = img.resize(new_size, PILImage.LANCZOS)
            img.save(local_path, "JPEG", quality=85, optimize=True)
            img.close()
            temp_path.unlink(missing_ok=True)
            _proxy_cache_set(url, local_path.read_bytes(), "image/jpeg")
        except Exception as e:
            _req_logger.debug("封面图片优化失败，使用原始文件: %s", e)
            temp_path.rename(local_path)

        rel = local_path.relative_to(DOWNLOAD_DIR).as_posix()
        return {"success": True, "path": rel}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"下载封面图片失败: {e}")


@router.get("/api/articles/{article_id}")
async def get_article(article_id: str):
    """获取单篇文章。"""
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    return {"article": article}


@router.put("/api/articles/{article_id}")
async def update_article(article_id: str, req: ArticleUpdateRequest):
    """更新文章。"""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    article = app_state.update_article(article_id, updates)
    if not article:
        raise HTTPException(404, "文章不存在")
    return {"success": True, "article": article}


@router.delete("/api/articles/{article_id}")
async def delete_article(article_id: str):
    """删除文章。"""
    if app_state.delete_article(article_id):
        return {"success": True}
    raise HTTPException(404, "文章不存在")


@router.post("/api/articles/{article_id}/save-to-materials")
async def save_article_to_materials(article_id: str):
    """将文章保存为素材文件（.md 格式）。"""
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")

    title = article.get("title", "") or "无标题"
    content = article.get("content", "") or ""
    cover = article.get("cover", "") or ""
    tags = article.get("tags", []) or []

    # 标题转文件名 slug
    slug = re.sub(r'[^\w一-鿿\-]', '_', title)[:60]
    slug = slug.strip('_') or f"article_{article_id[:8]}"

    # 确保目录存在
    articles_dir = TEXT_DIR / "articles"
    articles_dir.mkdir(parents=True, exist_ok=True)

    # 构建 Markdown 文件内容（含 YAML front matter）
    from datetime import datetime
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = ["---"]
    lines.append(f"title: {title}")
    lines.append(f"created_at: {now_str}")
    lines.append(f"source: article_{article_id[:8]}")
    if tags:
        tags_str = ", ".join(tags)
        lines.append(f"tags: [{tags_str}]")
    if cover:
        lines.append(f"cover: {cover}")
    lines.append("---")
    lines.append("")
    lines.append(f"# {title}")
    lines.append("")
    lines.append(content)

    md_path = articles_dir / f"{slug}.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")

    # 拷贝封面图片
    cover_path_rel = ""
    if cover:
        cover_src = (DOWNLOAD_DIR / cover).resolve()
        cover_dest_dir = articles_dir / "covers"
        cover_dest_dir.mkdir(parents=True, exist_ok=True)
        if cover_src.exists() and str(cover_src).startswith(str(DOWNLOAD_DIR.resolve())):
            cover_dest = cover_dest_dir / cover_src.name
            import shutil
            shutil.copy2(str(cover_src), str(cover_dest))
            cover_path_rel = f"text/articles/covers/{cover_src.name}"

    rel_path = f"text/articles/{slug}.md"
    app_state.add_operation("保存到素材", f"文章「{title}」")
    return {
        "success": True,
        "path": rel_path,
        "cover_path": cover_path_rel,
    }
async def generate_article_content(article_id: str, req: ArticleGenerateRequest):
    """AI 根据话题/标题生成正文。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")

    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")

    topic = req.topic or article.get("source", "") or article.get("title", "")
    title = req.title or article.get("title", "")
    if not topic:
        raise HTTPException(400, "缺少话题或标题")

    try:
        content = generate_article(
            topic, title,
            article_type=req.article_type,
            tone=req.tone,
            word_count=req.word_count,
            with_subtitles=req.with_subtitles,
            gallery_friendly=req.gallery_friendly,
            template_prompt=req.template_prompt,
        )
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    app_state.update_article(article_id, {"content": content, "ai_generated": True})
    app_state.add_operation("AI 生成", f"为「{title or topic}」生成正文")
    return {"success": True, "content": content}


@router.post("/api/articles/{article_id}/polish")
async def polish_article_content(article_id: str):
    """AI 校对润色文章正文。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空，无法校对")

    polished = polish_article(content)
    app_state.update_article(article_id, {"content": polished})
    app_state.add_operation("AI 校对", f"「{article.get('title', '') or '无标题'}」")
    return {"success": True, "content": polished}


@router.post("/api/articles/{article_id}/de-ai")
async def de_ai_article_content(article_id: str):
    """去 AI 味儿。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空")

    rewritten = de_ai_article(content)
    app_state.update_article(article_id, {"content": rewritten})
    app_state.add_operation("去 AI 味儿", f"「{article.get('title', '') or '无标题'}」")
    return {"success": True, "content": rewritten}


@router.post("/api/articles/{article_id}/generate-title")
async def generate_article_title_endpoint(article_id: str):
    """AI 从正文生成标题。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空")

    title = generate_article_title(content)
    if title:
        app_state.update_article(article_id, {"title": title})
        app_state.add_operation("AI 生成标题", f"「{title}」")
    return {"success": bool(title), "title": title}


@router.post("/api/articles/{article_id}/title-candidates")
async def generate_article_title_candidates_endpoint(article_id: str):
    """AI 从正文生成多个标题候选。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空")

    candidates = generate_article_title_candidates(content)
    app_state.add_operation("AI 标题候选", f"「{article.get('title', '') or '无标题'}」")
    return {"success": bool(candidates), "candidates": candidates}


@router.post("/api/articles/{article_id}/optimize-layout")
async def optimize_article_layout(article_id: str):
    """AI 优化文章排版结构。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空")

    optimized = optimize_layout(content)
    app_state.update_article(article_id, {"content": optimized})
    app_state.add_operation("AI 优化排版", f"「{article.get('title', '') or '无标题'}」")
    return {"success": True, "content": optimized}


@router.post("/api/articles/{article_id}/chat")
async def chat_article_content(article_id: str, req: ArticleChatRequest):
    """AI 对话式修改/生成正文（SSE 流式响应）。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    instruction = req.instruction.strip()
    if not instruction:
        raise HTTPException(400, "请输入指令")

    # 在进入线程前构建 prompt（req 对象不能跨线程）
    msg_dicts = [m.model_dump() for m in req.messages] if req.messages else None

    # === 联网搜索处理 ===
    from services.ai.web_search import extract_urls, has_search_intent, search_web, fetch_url_content
    web_context = ""
    urls = extract_urls(instruction)
    if urls:
        _req_logger.info("检测到 %d 个 URL，开始提取内容", len(urls))
        fetched = []
        for url in urls[:3]:  # 最多处理 3 个 URL
            content = fetch_url_content(url)
            if content:
                fetched.append(content)
        if fetched:
            web_context += "用户提供了以下链接的内容：\n\n" + "\n\n---\n\n".join(fetched)

    if has_search_intent(instruction):
        # 从指令中提取搜索关键词（去掉 URL 和已知的引导词）
        search_query = instruction
        for url in urls:
            search_query = search_query.replace(url, "")
        for prefix in ["搜索", "查一下", "查查", "搜一下", "帮我找", "找找", "search", "look up"]:
            search_query = search_query.replace(prefix, "")
        search_query = search_query.strip().strip(":：，,。、").strip() or instruction[:100]

        _req_logger.info("检测到搜索意图，搜索: %s", search_query[:60])
        search_result = search_web(search_query)
        if search_result:
            if web_context:
                web_context += "\n\n"
            web_context += "用户要求搜索以下内容：\n\n" + search_result

    # 如果只有 URL 提取无搜索结果，加个引导说明
    if web_context:
        web_context = f"用户{'提供了链接' if urls else ''}{'并要求搜索' if has_search_intent(instruction) else ''}，以下是获取到的信息：\n\n{web_context}"

    prompt = _build_chat_prompt(
        article.get("content", ""), instruction, messages=msg_dicts,
        title=article.get("title", ""), tags=article.get("tags"),
        web_context=web_context, write_mode=req.write_mode,
    )

    def _task(msg_queue):
        from services.ai.client import _call_ai_stream
        SEPARATOR = "\n---\n"
        full_content = []
        separator_found = False
        sent_up_to = 0  # 已发送的 message 字符数
        try:
            for token in _call_ai_stream(prompt, raise_on_fail=True):
                full_content.append(token)
                if not separator_found:
                    buffer = "".join(full_content)
                    sep_idx = buffer.find(SEPARATOR)
                    if sep_idx != -1:
                        separator_found = True
                        # 发送分隔符前的解释部分（未发送的尾部）
                        explanation = buffer[sent_up_to:sep_idx]
                        if explanation:
                            msg_queue.put(("message", explanation))
                        # 发送分隔符后的内容部分
                        after_sep = buffer[sep_idx + len(SEPARATOR):]
                        if after_sep:
                            msg_queue.put(("content", after_sep))
                        sent_up_to = -1  # 标记已切换到 content 模式
                    else:
                        # 分隔符未找到，逐 token 发送为 message
                        # 但要保留 buffer 尾部以防分隔符被跨 token 切分
                        safe_len = len(buffer) - 10  # 保留尾部 10 字符
                        if safe_len > sent_up_to:
                            chunk = buffer[sent_up_to:safe_len]
                            msg_queue.put(("message", chunk))
                            sent_up_to = safe_len
                else:
                    # 分隔符已找到，token 直接作为 content 发送
                    msg_queue.put(("content", token))

            # 流结束，处理剩余 buffer
            buffer = "".join(full_content)
            if not separator_found:
                # 分隔符从未出现，整个输出作为文章内容
                remaining = buffer[sent_up_to:] if sent_up_to >= 0 else buffer
                if remaining:
                    msg_queue.put(("message", remaining))
                final_content = buffer.strip()
            else:
                # 分隔符已找到，发送 buffer 中分隔符后未发送的部分
                sep_idx = buffer.find(SEPARATOR)
                final_content = buffer[sep_idx + len(SEPARATOR):].strip()

            if final_content and req.write_mode:
                app_state.update_article(article_id, {"content": final_content, "ai_generated": True})
                app_state.add_operation("AI 对话", f"「{instruction[:30]}」")
            msg_queue.put(("done", {"content": final_content}))
        except Exception as e:
            msg_queue.put(("error", str(e)))

    return create_sse_response(_task)


@router.post("/api/articles/{article_id}/queue")
async def add_article_to_queue(article_id: str):
    """将文章加入发布队列。"""
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")

    content_html = build_html(article.get("content", ""), article.get("images", []))
    queue_item = {
        "title": article.get("title", ""),
        "desc": content_html,
        "images": list(article.get("images", [])),
        "cover": article.get("cover", ""),
        "celebrity": article.get("celebrity", ""),
        "type": "article",
        "article_id": article_id,
        "tags": list(article.get("tags", [])),
        "content": article.get("content", ""),
    }
    app_state.add_to_queue(queue_item)
    app_state.update_article(article_id, {"status": "queued"})
    app_state.add_operation("加入队列", f"文章「{article.get('title', '') or '无标题'}」")
    return {"success": True, "queue": app_state.get_queue()}


def _run_article_publish_background(
    article_id: str,
    title: str,
    content_html: str,
    abs_images: List[str],
    abs_cover: Optional[str],
    dry_run: bool,
    save_draft: bool,
    account_id: Optional[str],
    raw_images: List[str],
):
    """后台线程执行文章发布。"""
    from services.wechat import publish_article as wechat_publish

    def _on_log(msg: str) -> None:
        app_state.add_publish_log(msg)

    try:
        result = wechat_publish(
            title=title,
            content=content_html,
            images=abs_images,
            cover=abs_cover,
            dry_run=dry_run,
            save_draft=save_draft,
            account_id=account_id,
            on_scan_needed=lambda: _on_log("请在弹出的浏览器窗口中扫码登录"),
            on_confirm_needed=lambda t: True,
            on_log=_on_log,
        )
    except Exception as err:
        app_state.finish_publish()
        msg = friendly_error_message(err)
        _on_log(msg)
        app_state.update_article(article_id, {"status": "failed"})
        return

    app_state.finish_publish()
    if result.get("success"):
        status = "published" if not save_draft else "saved_to_wechat"
        app_state.update_article(article_id, {"status": status})
        action = "保存草稿" if save_draft else "发布"
        app_state.add_operation(action, f"文章「{title}」")
        # 发布成功后扣除积分（保存草稿不扣）
        if not save_draft:
            from desktop.app_state import PUBLISH_COST
            app_state.spend_credits(PUBLISH_COST, "publish", f"发布文章「{title}」")
        for img in raw_images:
            app_state.update_materials_meta(img, {"used_count": (app_state.get_materials_meta(img) or {}).get("used_count", 0) + 1})
    else:
        result["message"] = friendly_error_message(result.get("message", "发布失败"))
        app_state.update_article(article_id, {"status": "failed"})


@router.post("/api/articles/{article_id}/publish")
async def publish_article_endpoint(article_id: str, req: ArticlePublishRequest):
    """直接发布文章到公众号。"""
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")

    title = article.get("title", "")
    content = article.get("content", "")
    images = article.get("images", [])
    cover = article.get("cover", "")

    if not title:
        from desktop.api_helpers import raise_friendly
        raise_friendly(400, "标题为空")

    # 发布前检查积分（保存草稿不扣积分）
    if not req.save_draft and not req.dry_run:
        from desktop.app_state import PUBLISH_COST
        balance = app_state.get_credits_balance()
        if balance < PUBLISH_COST:
            raise HTTPException(
                402,
                f"积分不足，当前余额 {balance} 积分，发布需要 {PUBLISH_COST} 积分。请先签到或获取积分。"
            )

    content_html = build_html(content, images)
    abs_images = [str(DOWNLOAD_DIR / img) if not Path(img).is_absolute() else img for img in images]
    abs_cover: Optional[str] = None
    if cover:
        cover_abs = str(DOWNLOAD_DIR / cover) if not Path(cover).is_absolute() else cover
        if Path(cover_abs).exists():
            abs_cover = cover_abs

    app_state.clear_publish_logs()
    threading.Thread(
        target=_run_article_publish_background,
        args=(
            article_id, title, content_html, abs_images, abs_cover,
            req.dry_run, req.save_draft, req.account_id,
            list(images),
        ),
        daemon=True,
    ).start()

    return {"success": True, "started": True, "message": "发布任务已启动"}


# ── 合规检查 API ──────────────────────────────────────


@router.get("/api/compliance/duplicate")
async def check_duplicate_title(title: str = Query("")):
    """检查标题是否与已有队列/文章重复。"""
    if not title.strip():
        return {"duplicates": []}
    t = title.strip().lower()
    duplicates = []
    for item in app_state.get_queue():
        existing = (item.get("title") or "").strip().lower()
        if existing and (existing == t or (len(t) > 4 and (existing.startswith(t) or t.startswith(existing)))):
            duplicates.append({"title": item.get("title", ""), "status": item.get("status", "queued"), "type": "queue"})
    for article in app_state.get_articles():
        existing = (article.get("title") or "").strip().lower()
        if existing and (existing == t or (len(t) > 4 and (existing.startswith(t) or t.startswith(existing)))):
            duplicates.append({"title": article.get("title", ""), "status": article.get("status", "draft"), "type": "article"})
    seen = set()
    unique = []
    for d in duplicates:
        key = d["title"]
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return {"duplicates": unique[:5]}


# ── 发布效果 API 已迁移至 desktop/routers/effects.py ──
