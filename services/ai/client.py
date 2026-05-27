"""AI API 客户端 — 通用调用逻辑。"""

import re
import time
from typing import List

import requests

from config import settings
from utils.logger import get_logger

logger = get_logger(__name__)

# ── Emoji 清除 ────────────────────────────────────────
_EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # Emoticons
    "\U0001F300-\U0001F5FF"  # Misc Symbols and Pictographs
    "\U0001F680-\U0001F6FF"  # Transport and Map
    "\U0001F1E0-\U0001F1FF"  # Regional Indicator Symbols (flags)
    "\U00002702-\U000027B0"  # Dingbats
    "\U000024C2"             # Ⓜ (individual emoji, NOT a range)
    "\U0001F100-\U0001F1FF"  # Enclosed Alphanumeric Supplement
    "\U0001F200-\U0001F2FF"  # Enclosed Ideographic Supplement
    "\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
    "\U0001FA00-\U0001FA6F"  # Chess Symbols
    "\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
    "\U00002600-\U000026FF"  # Misc symbols
    "\U0000FE00-\U0000FE0F"  # Variation Selectors
    "\U0000200D"             # Zero Width Joiner
    "]+"
)


def strip_emoji(text: str) -> str:
    """Remove emoji characters from text."""
    if not text:
        return text
    return _EMOJI_PATTERN.sub("", text).strip()


def _normalize_model_name(model: str) -> str:
    m = (model or "").strip()
    # deepseek 旧名称兼容
    if m == "deepseek-chat":
        return "deepseek-v4-flash"
    if m == "deepseek-reasoner":
        return "deepseek-v4-pro"
    return m or "mimo-v2.5-pro"


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
    if re.search(r"/v\d+$", base):
        return [f"{base}/chat/completions"]
    # 无版本号，先试直接拼接，再试 /v1 标准路径
    return [f"{base}/chat/completions", f"{base}/v1/chat/completions"]


def _call_ai(prompt: str, fallback: str, *, raise_on_fail: bool = False) -> str:
    """通用 AI 调用：发 prompt 返回文本内容。raise_on_fail=True 时失败抛异常。"""
    if not settings.ai_api_key:
        logger.error("未配置 AI_API_KEY")
        if raise_on_fail:
            raise RuntimeError("未配置 AI API Key，请先在设置页配置")
        return fallback

    url_candidates = _resolve_chat_url_candidates()
    if not url_candidates:
        logger.error("当前 AI_PROVIDER=%s 但未配置 AI_BASE_URL", settings.ai_provider)
        if raise_on_fail:
            raise RuntimeError("未配置 AI Base URL，请先在设置页配置")
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
                        timeout=settings.ai_timeout,
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
    if raise_on_fail:
        raise RuntimeError(f"AI 服务调用失败（已重试 {settings.retry_times} 次）：{last_err}")
    return fallback
