"""AI 内容生成功能 — 标题/文章生成、润色、排版等。"""

import json
import re
import time
from typing import List, Tuple

import requests

from config import settings
from utils.logger import get_logger

from services.ai.client import _call_ai, _normalize_model_name, _resolve_chat_url_candidates, strip_emoji
from services.ai.prompts import (
    ARTICLE_CHAT_TEMPLATE,
    ARTICLE_DEAI_TEMPLATE,
    ARTICLE_GENERATE_TEMPLATE,
    ARTICLE_OPTIMIZE_LAYOUT_TEMPLATE,
    ARTICLE_POLISH_TEMPLATE,
    ARTICLE_TEMPLATE_GENERATE_TEMPLATE,
    ARTICLE_TITLE_CANDIDATES_TEMPLATE,
    ARTICLE_TITLE_TEMPLATE,
    PROMPT_TEMPLATE,
    TRENDING_CELEBRITIES_TEMPLATE,
)

logger = get_logger(__name__)


def generate_content(text: str) -> Tuple[str, str]:
    if not settings.ai_api_key:
        logger.error("未配置 AI_API_KEY，使用降级文案")
        return "今日美图分享", ""

    last_err = None
    prompt = PROMPT_TEMPLATE.format(text=text[:500])
    url_candidates = _resolve_chat_url_candidates()
    if not url_candidates:
        logger.error("当前 AI_PROVIDER=%s 但未配置 AI_BASE_URL，使用降级文案", settings.ai_provider)
        return "今日美图分享", "精选高清美图，欢迎查看"
    headers = {
        "Authorization": f"Bearer {settings.ai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _normalize_model_name(settings.ai_model),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.8,
    }

    for i in range(settings.retry_times):
        try:
            for url in url_candidates:
                try:
                    resp = requests.post(
                        url,
                        headers=headers,
                        json=payload,
                        timeout=settings.ai_timeout,
                    )
                    if resp.status_code >= 400:
                        logger.error("AI 接口返回 %s，url=%s，body=%s", resp.status_code, url, resp.text[:300])
                    resp.raise_for_status()
                    raw = (
                        resp.json()
                        .get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "{}")
                    )
                    data = json.loads(raw)
                    raw_title = str(data.get("title", ""))
                    title = strip_emoji(raw_title).strip()[:20] or "今日美图分享"
                    return title, ""
                except Exception as inner_err:
                    last_err = inner_err
                    continue
            logger.error("AI 生成失败，第 %s 次重试: %s", i + 1, last_err)
            time.sleep(1.2 * (i + 1))
        except Exception as err:
            last_err = err
            logger.error("AI 生成失败，第 %s 次重试: %s", i + 1, err)
            time.sleep(1.2 * (i + 1))

    logger.error("AI 接口失败，使用兜底文案: %s", last_err)
    return "今日美图分享", ""


def chat_article(content: str, instruction: str, messages: list | None = None) -> str:
    """根据用户指令修改或生成文章正文，支持多轮对话上下文。"""
    # 构建对话历史文本（最近 5 轮）
    history_lines: list[str] = []
    if messages:
        # 取最近 10 条（5 轮 user+assistant），排除最后一条（即当前 instruction）
        recent = messages[:-1] if messages else []
        recent = recent[-10:]
        if recent:
            history_lines.append("对话历史：")
            for msg in recent:
                role = "用户" if msg.get("role") == "user" else "助手"
                text = (msg.get("content") or "")[:500]
                if text:
                    history_lines.append(f"{role}：{text}")
            history_lines.append("")
    chat_history = "\n".join(history_lines)

    prompt = ARTICLE_CHAT_TEMPLATE.format(
        content=content[:3000] or "(空)",
        chat_history=chat_history,
        instruction=instruction,
    )
    return _call_ai(prompt, instruction)


def generate_article(
    topic: str,
    title: str = "",
    article_type: str = "",
    tone: str = "",
    word_count: str = "",
    with_subtitles: bool = True,
    gallery_friendly: bool = False,
    template_prompt: str = "",
) -> str:
    """根据话题和标题生成公众号文章正文。"""
    if article_type or tone or word_count or template_prompt:
        prompt = ARTICLE_TEMPLATE_GENERATE_TEMPLATE.format(
            topic=topic,
            title=title or topic,
            article_type=article_type or "通用文章",
            tone=tone or "轻松自然",
            word_count=word_count or "500-800 字",
            with_subtitles="是" if with_subtitles else "否",
            gallery_friendly="是" if gallery_friendly else "否",
            template_prompt=template_prompt or "按常规公众号文章结构展开。",
        )
    else:
        prompt = ARTICLE_GENERATE_TEMPLATE.format(topic=topic, title=title or topic)
    return _call_ai(prompt, f"关于{topic}的一点分享", raise_on_fail=True)


def polish_article(content: str) -> str:
    """AI 校对润色文章。"""
    if not content or not content.strip():
        return content
    prompt = ARTICLE_POLISH_TEMPLATE.format(content=content[:2000])
    return _call_ai(prompt, content)


def de_ai_article(content: str) -> str:
    """去 AI 味儿，让文章更自然。"""
    if not content or not content.strip():
        return content
    prompt = ARTICLE_DEAI_TEMPLATE.format(content=content[:2000])
    return _call_ai(prompt, content)


def generate_article_title(content: str) -> str:
    """从正文生成标题。"""
    if not content or not content.strip():
        return ""
    prompt = ARTICLE_TITLE_TEMPLATE.format(content=content[:1000])
    title = _call_ai(prompt, "")
    # 清理可能的引号、多余字符和 emoji
    return strip_emoji(title.strip('"\' \n')[:20])


def generate_article_title_candidates(content: str) -> List[dict]:
    """从正文生成多个标题候选。"""
    if not content or not content.strip():
        return []
    prompt = ARTICLE_TITLE_CANDIDATES_TEMPLATE.format(content=content[:1200])
    raw = _call_ai(prompt, "")
    fallback_types = ["稳妥版", "点击率版", "温柔版", "热点版", "简短版"]
    candidates: List[dict] = []
    try:
        data = json.loads(raw)
        for item in data.get("candidates", []):
            title = strip_emoji(str(item.get("title", ""))).strip().strip('"\'')[:20]
            kind = str(item.get("type", "")).strip() or fallback_types[len(candidates) % len(fallback_types)]
            if title:
                candidates.append({"type": kind, "title": title})
    except Exception:
        for line in raw.splitlines():
            cleaned = strip_emoji(line.strip(" -0123456789.、:：\"'"))
            if cleaned:
                candidates.append({"type": fallback_types[len(candidates) % len(fallback_types)], "title": cleaned[:20]})
            if len(candidates) >= 5:
                break
    seen = set()
    unique = []
    for c in candidates:
        if c["title"] in seen:
            continue
        seen.add(c["title"])
        unique.append(c)
    return unique[:5]


def optimize_layout(content: str) -> str:
    """AI 优化文章排版结构（标题层级、分段、列表等）。"""
    if not content or not content.strip():
        return content
    prompt = ARTICLE_OPTIMIZE_LAYOUT_TEMPLATE.format(content=content[:2000])
    return _call_ai(prompt, content)


def recommend_celebrities() -> list[str]:
    """AI 推荐当前热门女明星列表。"""
    raw = _call_ai(TRENDING_CELEBRITIES_TEMPLATE, "")
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(c).strip() for c in data if str(c).strip()][:10]
    except Exception:
        pass
    # fallback: 尝试从文本中解析引号内的内容
    matches = re.findall(r'"([^"]+)"', raw)
    if matches:
        return matches[:10]
    # 硬编码兜底
    return ["迪丽热巴", "杨幂", "赵丽颖", "刘亦菲", "杨紫", "白鹿", "虞书欣", "赵露思", "关晓彤", "周也"]
