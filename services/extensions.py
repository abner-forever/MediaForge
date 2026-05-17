"""图片质量评分 + 封面选择 + HTML 排版。

评分策略：
1. 优先使用 AI Vision API（OpenAI 兼容接口）对图片进行多维度打分
2. 若 Vision API 不可用，回退到基于水印启发式的本地评分
"""

from __future__ import annotations

import base64
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Tuple

import requests

from config import settings
from utils.logger import get_logger


logger = get_logger(__name__)

VISION_PROMPT = """你是一位专业的图片质量评审专家。请对以下图片进行评分。

评分维度（每项 0-25 分，总分 0-100）：
1. 清晰度：图片是否清晰、无模糊
2. 美观度：构图、色彩、光影是否好看
3. 内容质量：人物/场景是否具有吸引力
4. 公众号适配度：是否适合作为微信公众号文章配图

请严格返回 JSON：{"score": 整数0-100, "reason": "一句话理由（15字以内）"}
"""


def _resolve_vision_url() -> str:
    """复用 ai.py 的 URL 解析逻辑，返回 vision endpoint。"""
    base = (settings.ai_base_url or "").rstrip("/")
    if not base:
        if settings.ai_provider == "deepseek":
            base = "https://api.deepseek.com"
        elif settings.ai_provider == "glm":
            base = "https://open.bigmodel.cn/api/paas/v4"
        else:
            return ""
    for suffix in ("/messages", "/v1/messages", "/chat/completions"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    base = base.rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _image_to_base64_url(path: str) -> str:
    """将本地图片转为 base64 data URL。"""
    data = Path(path).read_bytes()
    b64 = base64.b64encode(data).decode()
    # 简单判断格式
    suffix = Path(path).suffix.lower()
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}
    m = mime.get(suffix.lstrip("."), "image/jpeg")
    return f"data:{m};base64,{b64}"


def _score_with_vision(path: str) -> Tuple[int, str]:
    """调用 Vision API 评分，返回 (score, reason)。"""
    url = _resolve_vision_url()
    if not url or not settings.ai_api_key:
        return -1, ""

    try:
        img_url = _image_to_base64_url(path)
        headers = {
            "Authorization": f"Bearer {settings.ai_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.ai_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": VISION_PROMPT},
                        {"type": "image_url", "image_url": {"url": img_url}},
                    ],
                }
            ],
            "max_tokens": 200,
            "temperature": 0.3,
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        raw = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "{}")
        # 尝试从 markdown code block 中提取 JSON
        if "```" in raw:
            import re
            m = re.search(r"\{[^}]+\}", raw)
            if m:
                raw = m.group()
        data = json.loads(raw)
        score = int(data.get("score", 0))
        reason = str(data.get("reason", ""))[:50]
        return max(0, min(100, score)), reason
    except Exception as err:
        logger.warning("Vision 评分失败 %s: %s", path, err)
        return -1, ""


def _score_with_heuristic(path: str) -> Tuple[int, str]:
    """基于水印启发式的本地评分（无需 API）。"""
    from services.watermark import watermark_metrics

    try:
        corner_r, bottom_r = watermark_metrics(path)
        peak = max(corner_r, bottom_r)
        if peak <= 1.0:
            return 85, "无水印嫌疑"
        elif peak <= 1.2:
            return 65, "轻微水印特征"
        elif peak <= 1.4:
            return 40, "疑似水印"
        else:
            return 20, "水印明显"
    except Exception:
        return 50, "启发式评分异常"


def score_image(path: str, use_vision: bool = True) -> Dict:
    """
    综合质量评分。

    返回 {"score": int(0-100), "reason": str, "method": "vision"|"heuristic"}
    """
    if use_vision:
        score, reason = _score_with_vision(path)
        if score >= 0:
            return {"score": score, "reason": reason, "method": "vision"}
        logger.info("Vision API 不可用，回退到启发式评分: %s", path)

    score, reason = _score_with_heuristic(path)
    return {"score": score, "reason": reason, "method": "heuristic"}


def score_images_batch(
    paths: List[str],
    use_vision: bool = True,
    max_workers: int = 3,
) -> Dict[str, Dict]:
    """批量评分，返回 {path: {"score", "reason", "method"}}。"""
    results: Dict[str, Dict] = {}

    if use_vision:
        # Vision API 串行调用（避免并发限流）
        vision_failed = False
        for path in paths:
            score, reason = _score_with_vision(path)
            if score >= 0:
                results[path] = {"score": score, "reason": reason, "method": "vision"}
            else:
                if not vision_failed:
                    logger.info("Vision API 不可用，批量回退到启发式评分")
                    vision_failed = True
            time.sleep(0.3)  # 限流保护

    # 对未评分的用启发式补充
    remaining = [p for p in paths if p not in results]
    if remaining:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_score_with_heuristic, p): p for p in remaining}
            for future in as_completed(futures):
                path = futures[future]
                try:
                    score, reason = future.result()
                    results[path] = {"score": score, "reason": reason, "method": "heuristic"}
                except Exception:
                    results[path] = {"score": 0, "reason": "评分失败", "method": "error"}

    return results


def select_cover(images: List[str]) -> str:
    """封面选择：优先取评分最高的图片，否则取第一张。"""
    if not images:
        return ""
    # 如果在 Streamlit 环境且有评分数据，选最高的
    try:
        import streamlit as st
        scores = st.session_state.get("image_scores", {})
        if scores:
            best = max(images, key=lambda p: scores.get(p, {}).get("score", 0))
            return best
    except Exception:
        pass
    return images[0]


def build_html(desc: str, images: List[str]) -> str:
    """HTML 排版：简洁的公众号图文格式，保留段落换行。

    图片由发布流程通过文件上传单独插入正文（wechat.py），
    不在 HTML 中嵌入 <img> 标签，否则本地路径图片在微信编辑器中无法显示，
    且封面无法从正文选择。
    """
    import re

    body = ['<section style="padding:16px;">']

    # 按空行分割段落，保留格式
    for para in re.split(r'\n\s*\n', desc.strip()):
        lines = para.strip().split('\n')
        text = '<br>'.join(line for line in lines if line.strip())
        if text:
            body.append(f'<p style="font-size:16px;line-height:1.8;margin:0 0 1em 0;">{text}</p>')

    body.append('</section>')
    return '\n'.join(body)
