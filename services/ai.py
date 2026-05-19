import json
import time
from typing import List, Optional, Tuple

import requests

from config import settings
from utils.logger import get_logger


logger = get_logger(__name__)


PROMPT_TEMPLATE = """你是公众号运营专家，请润色以下内容，生成吸引点击的标题（20字以内）：

风格：轻松、有吸引力、不违规

请严格返回 JSON：{{"title":"..."}}
参考内容：{text}
"""

# ── 文章 AI 提示词 ─────────────────────────────────────

ARTICLE_GENERATE_TEMPLATE = """你是一名公众号文章写手，请根据以下话题写一篇公众号文章。

话题：{topic}
标题：{title}

要求：
- 字数 500-800 字，段落清晰
- 语言生动、口语化、有个人风格
- 避免过于正式的书面语
- 直接输出文章内容，不要 JSON
- 文章内容用换行分段
- 使用 Markdown 格式：标题用 ## ，加粗用 ** ，列表用 - 或 1. ，引用用 >
"""

ARTICLE_POLISH_TEMPLATE = """请对以下公众号文章进行校对和润色：

要求：
- 修复语病和错别字
- 优化表达，让语句更流畅
- 保持原文风格和长度
- 保留所有段落结构
- 直接输出润色后的内容，不要额外说明

文章内容：
{content}
"""

ARTICLE_DEAI_TEMPLATE = """以下是一篇 AI 生成的公众号文章，请改写使其更像是真人写的：

要求：
- 加入口语化表达
- 减少过于工整的排比句
- 增加自然停顿和语气词
- 保留核心信息和段落长度
- 直接输出改写后的内容，不要额外说明

文章内容：
{content}
"""

ARTICLE_TITLE_TEMPLATE = """请为以下公众号文章生成一个吸引点击的标题（20字以内）：

要求：
- 简洁有力，有吸引力
- 不要标题党，不违规
- 直接返回标题文本，不要 JSON，不要多余内容

文章内容：
{content}
"""

ARTICLE_OPTIMIZE_LAYOUT_TEMPLATE = """你是一名公众号排版编辑，请对以下文章内容进行排版优化，使其更适合微信公众号阅读。

要求：
- 使用适当的 Markdown 格式优化结构：## 标题、**加粗**、引用 >、列表 - 等
- 合理分段，每段不宜过长（3-5 句为宜）
- 突出核心观点和关键信息
- 保持原文内容不变，不增删实质信息
- 直接输出排版后的 Markdown 内容，不要额外说明

文章内容：
{content}
"""



def _normalize_model_name(model: str) -> str:
    m = (model or "").strip()
    # deepseek 旧名称兼容
    if m == "deepseek-chat":
        return "deepseek-v4-flash"
    if m == "deepseek-reasoner":
        return "deepseek-v4-pro"
    return m or "mimo-chat"


def _resolve_chat_url_candidates() -> List[str]:
    base = (settings.ai_base_url or "").rstrip("/")
    if not base:
        if settings.ai_provider == "deepseek":
            base = "https://api.deepseek.com"
        elif settings.ai_provider == "glm":
            base = "https://open.bigmodel.cn/api/paas/v4"
        elif settings.ai_provider == "qwen":
            base = "https://dashscope.aliyuncs.com/compatible-mode/v1"
        elif settings.ai_provider == "minimax":
            base = "https://api.minimaxi.com/v1"
        elif settings.ai_provider == "mimo":
            # 小米 Mimo 走 OpenAI 兼容接口时，需显式设置 AI_BASE_URL
            return []
        else:
            base = "https://api.openai.com/v1"
    # 清理常见的非 OpenAI 兼容后缀
    for suffix in ("/messages", "/v1/messages", "/chat/completions"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    # 清除尾部后缀
    base = base.rstrip("/")
    if base.endswith("/v1"):
        return [f"{base}/chat/completions"]
    # 如果基础地址已含版本号（如 /v4），不追加 /v1 兜底
    import re
    if re.search(r"/v\d+$", base):
        return [f"{base}/chat/completions"]
    # 无版本号，先试直接拼接，再试 /v1 标准路径
    return [f"{base}/chat/completions", f"{base}/v1/chat/completions"]


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
                        timeout=settings.request_timeout,
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
                    title = str(data.get("title", "")).strip()[:20] or "今日美图分享"
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


def _call_ai(prompt: str, fallback: str) -> str:
    """通用 AI 调用：发 prompt 返回文本内容。"""
    if not settings.ai_api_key:
        logger.error("未配置 AI_API_KEY")
        return fallback

    url_candidates = _resolve_chat_url_candidates()
    if not url_candidates:
        logger.error("当前 AI_PROVIDER=%s 但未配置 AI_BASE_URL", settings.ai_provider)
        return fallback

    headers = {
        "Authorization": f"Bearer {settings.ai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _normalize_model_name(settings.ai_model),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.8,
    }

    last_err = None
    for i in range(settings.retry_times):
        try:
            for url in url_candidates:
                try:
                    resp = requests.post(
                        url, headers=headers, json=payload,
                        timeout=settings.request_timeout,
                    )
                    if resp.status_code >= 400:
                        logger.error("AI 接口返回 %s，url=%s，body=%s", resp.status_code, url, resp.text[:300])
                    resp.raise_for_status()
                    content = (
                        resp.json()
                        .get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                    )
                    if content and content.strip():
                        return content.strip()
                except Exception as inner_err:
                    last_err = inner_err
                    continue
            logger.error("AI 调用失败，第 %s 次重试: %s", i + 1, last_err)
            time.sleep(1.2 * (i + 1))
        except Exception as err:
            last_err = err
            logger.error("AI 调用失败，第 %s 次重试: %s", i + 1, err)
            time.sleep(1.2 * (i + 1))
    return fallback


ARTICLE_CHAT_TEMPLATE = """你是一名公众号文章写作助手。请根据用户的要求对文章进行处理。

当前文章内容：
{content}

用户要求：{instruction}

请直接输出处理后的文章内容，不要额外说明。如果用户要求生成新文章，请直接输出正文。
"""


def chat_article(content: str, instruction: str) -> str:
    """根据用户指令修改或生成文章正文。"""
    prompt = ARTICLE_CHAT_TEMPLATE.format(content=content[:2000] or "(空)", instruction=instruction)
    return _call_ai(prompt, instruction)


def generate_article(topic: str, title: str = "") -> str:
    """根据话题和标题生成公众号文章正文。"""
    prompt = ARTICLE_GENERATE_TEMPLATE.format(topic=topic, title=title or topic)
    return _call_ai(prompt, f"关于{topic}的一点分享")


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
    # 清理可能的引号和多余字符
    return title.strip('"\' \n')[:20]


def optimize_layout(content: str) -> str:
    """AI 优化文章排版结构（标题层级、分段、列表等）。"""
    if not content or not content.strip():
        return content
    prompt = ARTICLE_OPTIMIZE_LAYOUT_TEMPLATE.format(content=content[:2000])
    return _call_ai(prompt, content)
