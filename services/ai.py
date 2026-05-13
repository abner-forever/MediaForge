import json
import time
from typing import List, Tuple

import requests

from config import settings
from utils.logger import get_logger


logger = get_logger(__name__)


PROMPT_TEMPLATE = """你是公众号运营专家，请润色以下内容，生成吸引点击的标题（20字以内）：

风格：轻松、有吸引力、不违规

请严格返回 JSON：{{"title":"..."}}
参考内容：{text}
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
        elif settings.ai_provider == "mimo":
            # 小米 Mimo 走 OpenAI 兼容接口时，需显式设置 AI_BASE_URL
            return []
        else:
            base = "https://api.openai.com/v1"
    # 清理常见的非 OpenAI 兼容后缀
    for suffix in ("/messages", "/v1/messages", "/chat/completions"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    base = base.rstrip("/")
    if base.endswith("/v1"):
        return [f"{base}/chat/completions"]
    return [f"{base}/v1/chat/completions"]


def generate_content(text: str) -> Tuple[str, str]:
    if not settings.ai_api_key:
        logger.error("未配置 AI_API_KEY/MIMO_API_KEY/DEEPSEEK_API_KEY，使用降级文案")
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
