"""联网搜索模块 — 使用 Tavily API 实现搜索和 URL 内容提取。"""

import re
from typing import List

from config import settings
from utils.logger import get_logger

logger = get_logger(__name__)

# URL 正则
_URL_PATTERN = re.compile(r'https?://[^\s,，。、；;：:）\)""''">】\]]+')


def _get_client():
    """惰性初始化 Tavily 客户端。"""
    try:
        from tavily import TavilyClient
        if not settings.tavily_api_key:
            logger.warning("TAVILY_API_KEY 未配置，无法使用联网搜索")
            return None
        return TavilyClient(api_key=settings.tavily_api_key)
    except ImportError:
        logger.warning("tavily-python 未安装，无法使用联网搜索")
        return None
    except Exception as e:
        logger.error("Tavily 客户端初始化失败: %s", e)
        return None


def extract_urls(text: str) -> List[str]:
    """从文本中提取所有 URL。"""
    return list(set(_URL_PATTERN.findall(text)))


def has_search_intent(text: str) -> bool:
    """判断是否包含搜索意图。"""
    keywords = [
        # 显式搜索指令
        "搜索", "查一下", "查找", "搜一下", "搜一搜", "帮我找", "找找",
        "查查", "查询", "检索", "了解一下", "搜搜",
        "search", "look up", "find", "google", "search for",
        "tell me about", "what is", "what are", "who is",
        # 时效性内容
        "最新", "热点", "新闻", "趋势", "热门", "热搜",
        # 天气
        "天气", "气温", "温度", "降雨", "下雨", "下雪",
        "台风", "雾霾", "湿度", "风力",
        # 实时信息
        "汇率", "股价", "股票", "时差", "实时",
    ]
    lower = text.lower()
    for kw in keywords:
        if kw in text or kw in lower:
            return True
    # 时间敏感型查询：今天/明天/最近 + 信息性内容
    time_patterns = ["今天", "明天", "最近", "现在", "当前", "目前"]
    info_indicators = ["天气", "气温", "新闻", "热点", "情况", "状况", "事件", "消息"]
    for tp in time_patterns:
        if tp in text:
            for ii in info_indicators:
                if ii in text:
                    return True
    return False


def search_web(query: str, max_results: int = 6) -> str:
    """搜索网络并返回格式化结果。"""
    client = _get_client()
    if not client:
        return ""

    try:
        logger.info("联网搜索: %s", query[:80])
        response = client.search(
            query=query,
            search_depth="advanced",
            max_results=max_results,
            include_answer=True,
            include_raw_content=False,
        )
        parts = []

        # 如果有 AI 摘要，先展示
        if response.get("answer"):
            parts.append(f"【搜索结果摘要】\n{response['answer']}\n")

        results = response.get("results", [])
        if results:
            parts.append("【相关网页】")
            for i, r in enumerate(results[:max_results], 1):
                title = r.get("title", "无标题")
                snippet = r.get("content", "")
                url = r.get("url", "")
                parts.append(f"{i}. {title}")
                if snippet:
                    parts.append(f"   {snippet[:300]}")
                if url:
                    parts.append(f"   链接: {url}")
                parts.append("")

        return "\n".join(parts).strip()
    except Exception as e:
        logger.error("联网搜索失败: %s", e)
        return ""


def fetch_url_content(url: str, max_chars: int = 5000) -> str:
    """提取指定 URL 的正文内容。"""
    client = _get_client()
    if not client:
        return ""

    try:
        logger.info("提取URL内容: %s", url[:80])
        response = client.extract(urls=[url])
        results = response.get("results", [])
        if not results:
            return ""

        content = results[0].get("content", "") or results[0].get("raw_content", "")
        if not content:
            return ""

        # 截取前 max_chars 字符，避免超长
        if len(content) > max_chars:
            content = content[:max_chars] + "\n\n...（内容过长，已截断）"

        title = results[0].get("title", "")
        parts = [f"标题：{title}", f"来源：{url}", "", content]
        return "\n".join(parts)
    except Exception as e:
        logger.error("提取URL内容失败 (%s): %s", url, e)
        return ""
