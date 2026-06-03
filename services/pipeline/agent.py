"""PipelineAgent — AI 驱动的自动化流水线编排核心类。

7 步流程：健康检查 → 抓取帖子 → 下载图片 → AI 评分 → 生成内容 → 加入队列 → 发布。
"""

from __future__ import annotations

import json
import random
import re
import time
import uuid
from datetime import datetime
from threading import Event
from typing import Any, Callable, Dict, List, Optional, Set

from config import DOWNLOAD_DIR, settings
from utils.logger import get_logger

from services.pipeline.constants import (
    EVENT_AGENT_DECISION,
    EVENT_CANCELLED,
    EVENT_CHECKPOINT,
    EVENT_COMPLETED,
    EVENT_DECISION_REQUIRED,
    EVENT_STEP_COMPLETE,
    EVENT_STEP_ERROR,
    EVENT_STEP_PROGRESS,
    EVENT_STEP_START,
    STEP_DOWNLOAD,
    STEP_ENQUEUE,
    STEP_FETCH,
    STEP_GENERATE,
    STEP_HEALTH,
    STEP_NAMES,
    STEP_PUBLISH,
    STEP_SCORE,
    PipelineEventCallback,
)
from services.pipeline.config import PipelineConfig
from services.pipeline.exceptions import PipelineCancelledError
from services.pipeline.dedup import _load_cache, _save_cache
from utils.file import hash_text

logger = get_logger(__name__)


class PipelineAgent:
    """编排完整流水线流程，在关键节点调用 LLM 做真实决策。"""

    def __init__(
        self,
        config: PipelineConfig,
        on_event: PipelineEventCallback,
        cancel_event: Optional[Event] = None,
    ) -> None:
        self.config = config
        self.on_event = on_event
        self.cancel_event = cancel_event or Event()
        self.run_id = uuid.uuid4().hex[:8]
        self._posts: List[dict] = []
        self._processed_items: List[dict] = []
        # Token 用量统计
        self.total_prompt_tokens = 0
        self.total_completion_tokens = 0

    # ── 取消检查 ────────────────────────────────────────
    def _check_cancelled(self) -> None:
        if self.cancel_event.is_set():
            raise PipelineCancelledError("用户取消了流水线")

    def _emit(self, event_type: str, step: str, data: dict) -> None:
        self.on_event(event_type, step, data)

    def _emit_decision(self, step: str, decision: str, reasoning: str) -> None:
        self._emit(EVENT_AGENT_DECISION, step, {
            "step": step,
            "decision": decision,
            "reasoning": reasoning,
        })

    def _emit_progress(self, step: str, current: int, total: int, detail: str = "") -> None:
        self._emit(EVENT_STEP_PROGRESS, step, {
            "step": step,
            "current": current,
            "total": total,
            "detail": detail,
        })

    # ── LLM 决策调用 ────────────────────────────────────
    def _call_llm(self, step: str, prompt: str, context: dict) -> dict:
        """调用 LLM 做决策，返回解析后的 JSON。失败时返回空的 fallback。"""
        full_prompt = f"""你是一个专业的内容运营 AI 助手，负责在自媒体流水线中做出决策。

当前阶段：{STEP_NAMES.get(step, step)}

上下文信息：
```json
{json.dumps(context, ensure_ascii=False, indent=2)}
```

任务说明：
{prompt}

请严格以 JSON 格式回复，包含以下字段：
- decision: string, 你的决定摘要
- reasoning: string, 你的推理过程（将展示给用户）
- action: string, 要执行的操作 (keep / skip / refine / proceed / stop)
- params: dict, 操作参数（根据任务不同包含不同字段）

只输出 JSON，不要输出其他文字。"""

        try:
            # 使用 chat completion 接口
            import requests as _req
            url_candidates = self._resolve_llm_urls()
            if not url_candidates:
                logger.warning("LLM 未配置，跳过 AI 决策")
                return {}

            headers = {
                "Authorization": f"Bearer {settings.ai_api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": settings.ai_model,
                "messages": [{"role": "user", "content": full_prompt}],
                "temperature": 0.3,
            }

            last_err = None
            for attempt in range(settings.retry_times):
                for url in url_candidates:
                    try:
                        resp = _req.post(
                            url, headers=headers, json=payload,
                            timeout=settings.ai_timeout,
                        )
                        resp.raise_for_status()
                        data = resp.json()
                        content = (
                            data
                            .get("choices", [{}])[0]
                            .get("message", {})
                            .get("content", "")
                        )
                        if not content or not content.strip():
                            continue
                        # 统计 token 用量
                        usage = data.get("usage", {})
                        self.total_prompt_tokens += usage.get("prompt_tokens", 0)
                        self.total_completion_tokens += usage.get("completion_tokens", 0)
                        return self._parse_llm_json(content.strip())
                    except Exception as e:
                        last_err = e
                        continue
                if attempt < settings.retry_times - 1:
                    time.sleep(1.2 * (attempt + 1))

            logger.warning("LLM 决策调用失败: %s，使用默认策略", last_err)
        except Exception as err:
            logger.warning("LLM 决策异常: %s，使用默认策略", err)

        return {}

    def _resolve_llm_urls(self) -> list[str]:
        """解析 LLM API URL 候选列表。"""
        if not settings.ai_api_key:
            return []
        if settings.ai_base_url:
            base = settings.ai_base_url.rstrip("/")
            # 清理常见的非 OpenAI 兼容后缀
            for suffix in ("/messages", "/v1/messages", "/chat/completions"):
                if base.endswith(suffix):
                    base = base[: -len(suffix)]
            base = base.rstrip("/")
            if base.endswith("/v1"):
                return [f"{base}/chat/completions"]
            import re
            if re.search(r"/v\d+$", base):
                return [f"{base}/chat/completions"]
            return [f"{base}/chat/completions", f"{base}/v1/chat/completions"]
        # 按供应商推断
        provider_map = {
            "mimo": "https://api.mimora.com",
            "openai": "https://api.openai.com",
            "deepseek": "https://api.deepseek.com",
            "glm": "https://open.bigmodel.cn/api/paas/v4",
            "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "minimax": "https://api.minimax.chat/v1",
        }
        base = provider_map.get(settings.ai_provider, "")
        if not base:
            return []
        return [f"{base}/chat/completions"]

    def _parse_llm_json(self, text: str) -> dict:
        """从 LLM 回复中提取 JSON（处理可能被 markdown 包裹的情况）。"""
        # 去掉 ```json ... ``` 包裹
        text = re.sub(r'^```(?:json)?\s*', '', text.strip())
        text = re.sub(r'\s*```$', '', text)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # 尝试提取第一个 { ... }
            m = re.search(r'\{.*\}', text, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group())
                except json.JSONDecodeError:
                    pass
            return {}

    # ── 交互决策 ─────────────────────────────────────────
    def _request_user_decision(self, step: str, message: str,
                                options: list[dict], context: dict) -> str | None:
        """在交互模式下向用户请求决策，返回用户选择的 option_id，超时返回 None。"""
        if self.config.ai_decision_mode != "interactive":
            return None
        try:
            from desktop.routers.pipeline import pipeline_decision_events, pipeline_decision_results
            decision_evt = Event()
            run_id = self.run_id
            pipeline_decision_events[run_id] = decision_evt

            self._emit(EVENT_DECISION_REQUIRED, step, {
                "step": step,
                "message": message,
                "pipeline_run_id": run_id,
                "options": options,
                "context": context,
            })

            confirmed = decision_evt.wait(timeout=300)
            result = pipeline_decision_results.pop(run_id, None)
            pipeline_decision_events.pop(run_id, None)
            if confirmed and result:
                self._emit_decision(step, f"用户选择: {result}", "用户已做出选择")
                return result
            else:
                self._emit_decision(step, "用户决策超时，使用默认策略", "")
                return None
        except Exception as e:
            logger.warning("请求用户决策失败: %s", e)
            return None

    # ── 主入口 ──────────────────────────────────────────
    def run(self) -> dict:
        """执行完整流水线，返回结果摘要。"""
        start_time = time.time()
        summary = {
            "run_id": self.run_id,
            "started_at": datetime.now().isoformat(),
            "total_posts": 0,
            "total_images": 0,
            "published": 0,
            "skipped": 0,
            "failed": 0,
            "items": [],
        }

        cancelled = False
        try:
            # Step 1: 健康检查
            health_ok = self._step_health_check()
            if not health_ok:
                self._emit(EVENT_STEP_ERROR, STEP_HEALTH, {
                    "step": STEP_HEALTH,
                    "error": "健康检查未通过，请检查平台登录和 AI 配置",
                })
                summary["failed"] = 1
                return summary

            # Step 2: 抓取帖子
            self._posts = self._step_fetch_posts()
            if not self._posts:
                self._emit(EVENT_STEP_COMPLETE, STEP_FETCH, {
                    "step": STEP_FETCH,
                    "result": {"total": 0, "message": "未找到帖子"},
                })
                return summary

            # 去重
            self._posts = self._dedup_posts(self._posts)
            if not self._posts:
                self._emit_decision(STEP_FETCH, "全部帖子均已处理过",
                                    "所有抓取到的帖子都在去重缓存中，跳过后续步骤")
                return summary

            # Step 3: 下载图片
            posts_with_images = self._step_download_images(self._posts)
            if not posts_with_images:
                return summary

            # Step 4: AI 评分
            self._step_score_images(posts_with_images)

            # Step 5: 生成内容
            self._step_generate_content(posts_with_images)

            # Step 6: 加入队列
            self._step_enqueue(posts_with_images)

            # 交互模式：没有内容进入队列时询问用户
            if not self._processed_items:
                total_fetched = len(self._posts) if self._posts else 0
                msg = (
                    f"流水线从 {total_fetched} 条帖子中未能筛选出可发布的内容"
                    if total_fetched else
                    "流水线未获取到任何帖子"
                )
                if self.config.ai_decision_mode == "interactive":
                    user_choice = self._request_user_decision(
                        "summary",
                        msg + "，是否接受当前结果？",
                        options=[
                            {"id": "continue", "label": "接受，结束流水线"},
                            {"id": "cancel", "label": "取消流水线"},
                        ],
                        context={
                            "total_fetched": total_fetched,
                            "total_enqueued": 0,
                            "ai_decision_mode": self.config.ai_decision_mode,
                        },
                    )
                    if user_choice == "cancel":
                        raise PipelineCancelledError("用户取消了流水线（无可用内容）")
                else:
                    self._emit_decision("summary", "没有内容进入发布队列",
                                        f"共抓取 {total_fetched} 条，全部未通过质量/图片筛选")

            # Step 7: 发布
            self._step_publish()

            # 收集结果
            for item in self._processed_items:
                summary["items"].append({
                    "title": item.get("title", ""),
                    "celebrity": item.get("celebrity", ""),
                    "images": len(item.get("images", [])),
                    "score": item.get("score", 0),
                    "status": item.get("status", "done"),
                })

            summary["total_posts"] = len(self._posts)
            summary["total_images"] = sum(
                len(p.get("local_images", [])) for p in self._processed_items
            )
            summary["published"] = sum(
                1 for p in self._processed_items if p.get("published", False)
            )

        except PipelineCancelledError:
            self._emit(EVENT_CANCELLED, "", {"reason": "用户取消了流水线"})
            summary["failed"] = 1
            cancelled = True
            return summary

        except Exception as err:
            logger.error("流水线执行异常: %s", err)
            self._emit(EVENT_STEP_ERROR, "", {"error": str(err)})
            summary["failed"] += 1

        finally:
            if not cancelled:
                elapsed = time.time() - start_time
                summary["elapsed_seconds"] = round(elapsed, 1)
                summary["prompt_tokens"] = self.total_prompt_tokens
                summary["completion_tokens"] = self.total_completion_tokens
                self._emit(EVENT_COMPLETED, "", {"summary": summary, "run_id": self.run_id})

        return summary

    # ── Step 1: 健康检查 ────────────────────────────────
    def _step_health_check(self) -> bool:
        self._check_cancelled()
        self._emit(EVENT_STEP_START, STEP_HEALTH, {
            "step": STEP_HEALTH,
            "name": STEP_NAMES[STEP_HEALTH],
            "reasoning": "检查平台登录状态和 AI 配置是否就绪...",
        })

        issues = []

        # 平台 Cookie 检查
        platform = self.config.platform
        if platform == "weibo":
            from utils.weibo_auth_store import read_weibo_auth
            auth = read_weibo_auth()
            if not auth.get("cookie"):
                issues.append("微博未登录")
            else:
                self._emit_decision(STEP_HEALTH, "微博登录有效",
                                    f"用户 {auth.get('screen_name', '未知')} 已登录")
        elif platform == "toutiao":
            from utils.toutiao_auth_store import read_toutiao_auth
            auth = read_toutiao_auth()
            if not auth.get("cookie"):
                issues.append("今日头条未登录")
            else:
                self._emit_decision(STEP_HEALTH, "头条登录有效",
                                    f"用户 {auth.get('screen_name', '未知')} 已登录")

        # AI API Key 检查
        from utils.api_key_store import read_api_keys
        keys = read_api_keys()
        active_key = keys.get(settings.ai_provider) or keys.get("default") or next(iter(keys.values()), None)
        if not active_key:
            issues.append("未配置 AI API Key")

        # 公众号登录检查（非 dry-run 且 require_confirm）
        if not self.config.dry_run and self.config.account_id:
            from utils.wechat_auth_store import get_account_paths
            _, state_path = get_account_paths(self.config.account_id)
            if not state_path.exists():
                issues.append(f"公众号账号 {self.config.account_id} 未登录")

        if issues:
            for issue in issues:
                self._emit_decision(STEP_HEALTH, "配置缺失", f"缺少: {issue}")
            self._emit(EVENT_STEP_COMPLETE, STEP_HEALTH, {
                "step": STEP_HEALTH,
                "result": {"ok": False, "issues": issues},
            })
            return False

        self._emit(EVENT_STEP_COMPLETE, STEP_HEALTH, {
            "step": STEP_HEALTH,
            "result": {"ok": True, "message": "所有检查通过"},
        })
        return True

    # ── Step 2: 抓取帖子 ────────────────────────────────
    def _step_fetch_posts(self) -> List[dict]:
        self._check_cancelled()
        self._emit(EVENT_STEP_START, STEP_FETCH, {
            "step": STEP_FETCH,
            "name": STEP_NAMES[STEP_FETCH],
            "reasoning": f"正在从 {self.config.platform} 抓取内容...",
        })

        try:
            from services.platforms import get_platform
            platform_svc = get_platform(self.config.platform)

            if not platform_svc:
                self._emit_decision(STEP_FETCH, "平台不可用",
                                    f"平台 '{self.config.platform}' 未注册")
                return []

            kwargs: dict = {
                "max_pages": self.config.max_pages,
            }
            if self.config.celebrities:
                kwargs["celebrities"] = self.config.celebrities
            if self.config.search_tags:
                kwargs["search_tags"] = self.config.search_tags
            if self.config.super_topics:
                kwargs["super_topics"] = self.config.super_topics

            mode = self.config.mode or platform_svc.meta.default_fetch_mode

            last_progress = 0

            def on_progress(msg: str) -> None:
                nonlocal last_progress
                self._emit_progress(STEP_FETCH, last_progress, 100, msg)
                last_progress += 1
                self._check_cancelled()

            posts = platform_svc.fetch_posts(
                mode=mode,
                progress_callback=on_progress,
                **kwargs,
            )

            if not posts:
                self._emit_decision(STEP_FETCH, "未找到帖子",
                                    "指定条件下没有搜索到任何帖子")
                return []

            # ── 关键词预过滤：剔除明显不合规内容 ──
            skip_keywords = [
                "时政", "突发",
                "投票", "抽奖",
            ]
            before_filter = len(posts)
            filtered_posts = []
            for p in posts:
                preview = ((p.get("title") or "") + " " + (p.get("text") or "")).lower()[:200]
                if any(kw in preview for kw in skip_keywords):
                    continue
                filtered_posts.append(p)
            posts = filtered_posts
            skipped_ad = before_filter - len(posts)
            if skipped_ad:
                self._emit_decision(
                    STEP_FETCH,
                    f"预过滤剔除 {skipped_ad} 条广告/推广内容",
                    "",
                )

            if not posts:
                self._emit_decision(STEP_FETCH, "预过滤后无可用帖子",
                                    "所有帖子均为广告/推广/时政类内容")
                return []

            # ── AI 决策：从帖子中精选 ──
            if self.config.ai_decisions and len(posts) > 1:

                if self.config.ai_decision_mode == "interactive":
                    # 交互模式：用户手动选择处理数量
                    user_choice = self._request_user_decision(
                        STEP_FETCH,
                        f"已抓取 {len(posts)} 条帖子，请选择要处理的数量",
                        options=[
                            {"id": "top3", "label": f"取前 {min(self.config.post_limit, 3)} 条"},
                            {"id": "top5", "label": "取前 5 条"},
                            {"id": "all", "label": f"处理全部 {len(posts)} 条"},
                        ],
                        context={
                            "post_count": len(posts),
                            "default_limit": min(self.config.post_limit, 3),
                            "posts": [
                                {"index": i, "text_preview": (p.get("text") or "")[:80],
                                 "celebrity": p.get("celebrity", ""),
                                 "image_count": len(p.get("images", []))}
                                for i, p in enumerate(posts[:20])
                            ],
                        },
                    )
                    limit = max(1, min(self.config.post_limit, 3))
                    if user_choice == "all":
                        limit = len(posts)
                    elif user_choice == "top5":
                        limit = min(5, len(posts))
                    posts = posts[:limit]
                    self._emit_decision(
                        STEP_FETCH,
                        f"用户选择取前 {len(posts)} 条",
                        "交互模式：用户自行决定处理数量",
                    )
                else:
                    # 自动模式：LLM 精选
                    context = {
                        "platform": self.config.platform,
                        "total_fetched": len(posts),
                        "max_select": min(self.config.post_limit, 3),
                        "posts": [
                            {
                                "index": i,
                                "text_preview": (p.get("text") or "")[:150],
                                "celebrity": p.get("celebrity", ""),
                                "scene": p.get("scene", ""),
                                "image_count": len(p.get("images", [])),
                                "screen_name": p.get("screen_name", ""),
                            }
                            for i, p in enumerate(posts)
                        ],
                    }
                    decision = self._call_llm(
                        STEP_FETCH,
                        f"""从 {len(posts)} 条帖子中精选出最适合公众号发布的 {min(self.config.post_limit, 3)} 条。

                    考量维度：
                    1. 内容质量 — 文本是否完整、有信息量
                    2. 图片质量 — 图片数量是否充足
                    3. 多样性 — 避免选择过于相似的内容
                    4. 话题热度 — 内容是否有时效性和传播性

                    回复格式：
                    - params.selected_indices: list[int], 选中的帖子索引列表（最多 {min(self.config.post_limit, 3)} 个）
                    - 如果某条帖子质量太差，不要选它""",
                        context,
                    )

                    selected = decision.get("params", {}).get("selected_indices", [])
                    if selected and all(0 <= i < len(posts) for i in selected):
                        reasoning = decision.get("reasoning", "") or ""
                        self._emit_decision(
                            STEP_FETCH,
                            f"AI 从 {len(posts)} 条中精选了 {len(selected)} 条",
                            reasoning,
                        )
                        posts = [posts[i] for i in selected[:self.config.post_limit]]
                    else:
                        limit = max(1, min(self.config.post_limit, 3))
                        posts = posts[:limit]
                        self._emit_decision(STEP_FETCH, f"LLM 决策失败，取前 {len(posts)} 条",
                                            "LLM 未能返回有效的精选结果，使用默认截取策略")
            else:
                limit = max(1, min(self.config.post_limit, 3))
                posts = posts[:limit]
                self._emit_decision(STEP_FETCH, f"找到 {len(posts)} 条帖子",
                                    f"按 limit={limit} 选取前 {len(posts)} 条进行处理")

            self._emit(EVENT_STEP_COMPLETE, STEP_FETCH, {
                "step": STEP_FETCH,
                "result": {"total": len(posts)},
            })
            return posts

        except PipelineCancelledError:
            raise
        except Exception as err:
            logger.error("抓取帖子失败: %s", err)
            self._emit(EVENT_STEP_ERROR, STEP_FETCH, {
                "step": STEP_FETCH,
                "error": str(err),
            })
            return []

    # ── 去重 ────────────────────────────────────────────
    def _dedup_posts(self, posts: List[dict]) -> List[dict]:
        cache = _load_cache()
        remaining = []
        skipped = 0

        for post in posts:
            post_id = str(post.get("id") or "")
            post_key = hash_text(post_id + (post.get("text") or ""))
            if post_id and post_id in cache["post_ids"]:
                skipped += 1
                continue
            if post_key in cache["post_hashes"]:
                skipped += 1
                continue
            remaining.append(post)

        if skipped:
            self._emit_decision(STEP_FETCH, f"跳过 {skipped} 条已处理帖子",
                                "这些帖子之前已处理过，跳过以避免重复")

        # 写回缓存
        remaining_ids = set()
        for post in remaining:
            post_id = str(post.get("id") or "")
            post_key = hash_text(post_id + (post.get("text") or ""))
            if post_id:
                cache["post_ids"].add(post_id)
            cache["post_hashes"].add(post_key)
        _save_cache(cache)

        return remaining

    # ── Step 3: 下载图片 ────────────────────────────────
    def _step_download_images(self, posts: List[dict]) -> List[dict]:
        self._check_cancelled()
        self._emit(EVENT_STEP_START, STEP_DOWNLOAD, {
            "step": STEP_DOWNLOAD,
            "name": STEP_NAMES[STEP_DOWNLOAD],
            "reasoning": "开始下载图片并过滤水印...",
        })

        from services.downloader import download_images

        result = []
        total_images = sum(len(p.get("images", [])) for p in posts)
        downloaded_so_far = 0

        self._emit_progress(STEP_DOWNLOAD, 0, total_images, "准备下载")

        for i, post in enumerate(posts):
            self._check_cancelled()

            post_text = (post.get("text") or "").strip()
            folder_id = post_text[:12] if post_text else (post.get("id") or "").strip()[:12]
            post_key = hash_text((post.get("id") or "") + post_text)[:8]

            try:
                images, dropped = download_images(
                    post["images"],
                    celebrity=post.get("celebrity") or "未命名",
                    scene=post.get("scene") or "日常",
                    post_slug=folder_id,
                    prefix=post_key,
                    overwrite=False,
                )

                downloaded_so_far += len(images)
                self._emit_progress(STEP_DOWNLOAD, downloaded_so_far, total_images,
                                    f"{post.get('celebrity', '')} · {post.get('scene', '')}")

                if not images:
                    self._emit_decision(STEP_DOWNLOAD, f"跳过帖子：无水印图",
                                        f"帖子 {post.get('id', '')} 没有保留任何图片")
                    continue

                post["local_images"] = images
                post["dropped_count"] = dropped
                result.append(post)

            except Exception as err:
                logger.error("下载图片失败: %s", err)
                self._emit(EVENT_STEP_ERROR, STEP_DOWNLOAD, {
                    "step": STEP_DOWNLOAD,
                    "error": f"帖子 {post.get('id', '')}: {err}",
                })
                continue

        # ── AI 决策：评估每篇帖子的图片质量 ──
        if self.config.ai_decisions and len(result) > 1:
            context = {
                "posts": [
                    {
                        "index": i,
                        "title": p.get("title", "") or (p.get("text") or "")[:60],
                        "celebrity": p.get("celebrity", ""),
                        "clean_images": len(p.get("local_images", [])),
                        "dropped_watermarks": p.get("dropped_count", 0),
                    }
                    for i, p in enumerate(result)
                ],
                "min_clean_images": self.config.min_clean_images,
            }
            decision = self._call_llm(
                STEP_DOWNLOAD,
                """评估每条帖子的图片情况，判断哪些帖子值得继续处理。

                考量维度：
                1. 图片数量 — 干净图片是否足够支撑一篇公众号文章（至少 3-4 张）
                2. 水印过滤情况 — 如果丢弃了大量图片，说明原图质量可能不佳
                3. 综合判断 — 图片太少或质量太差的帖子应该跳过

                回复格式：
                - params.skip_indices: list[int], 需要跳过的帖子索引
                - 如果所有帖子都值得保留，返回空列表""",
                context,
            )

            skip = decision.get("params", {}).get("skip_indices", [])
            if skip:
                reasoning = decision.get("reasoning", "") or ""
                self._emit_decision(
                    STEP_DOWNLOAD,
                    f"AI 判定跳过 {len(skip)} 条帖子（图片质量不足）",
                    reasoning,
                )
                result = [p for i, p in enumerate(result) if i not in skip]

        self._emit(EVENT_STEP_COMPLETE, STEP_DOWNLOAD, {
            "step": STEP_DOWNLOAD,
            "result": {
                "posts_with_images": len(result),
                "total_images": sum(len(p.get("local_images", [])) for p in result),
            },
        })
        return result

    # ── Step 4: AI 评分 ────────────────────────────────
    def _step_score_images(self, posts: List[dict]) -> None:
        self._check_cancelled()
        self._emit(EVENT_STEP_START, STEP_SCORE, {
            "step": STEP_SCORE,
            "name": STEP_NAMES[STEP_SCORE],
            "reasoning": "正在对图片进行综合评分...",
        })

        from services.extensions import score_images_batch

        all_paths = []
        path_to_post = {}
        for post in posts:
            for img in post.get("local_images", []):
                all_paths.append(img)
                path_to_post[img] = post

        if not all_paths:
            self._emit_decision(STEP_SCORE, "没有图片需要评分", "")
            self._emit(EVENT_STEP_COMPLETE, STEP_SCORE, {
                "step": STEP_SCORE,
                "result": {"scored": 0},
            })
            return

        self._emit_progress(STEP_SCORE, 0, len(all_paths), "正在进行 AI 评分...")

        try:
            scores = score_images_batch(all_paths, use_vision=True)
        except Exception as err:
            logger.error("评分失败: %s", err)
            self._emit(EVENT_STEP_ERROR, STEP_SCORE, {
                "step": STEP_SCORE,
                "error": str(err),
            })
            return

        # 将评分关联回帖子
        for path, score_info in scores.items():
            post = path_to_post.get(path)
            if post is not None:
                if "image_scores" not in post:
                    post["image_scores"] = {}
                post["image_scores"][path] = score_info

        # 统计评分结果
        vision_count = sum(1 for s in scores.values() if s.get("method") == "vision")
        heuristic_count = sum(1 for s in scores.values() if s.get("method") == "heuristic")

        # ── AI 决策：为每篇帖子选最佳封面 ──
        if self.config.ai_decisions:
            for post in posts:
                img_scores = post.get("image_scores", {})
                if not img_scores:
                    continue

                sorted_imgs = sorted(
                    img_scores.items(),
                    key=lambda x: x[1].get("score", 0),
                    reverse=True,
                )
                top3 = [{"path": p, "score": s.get("score", 0), "reason": s.get("reason", "")}
                        for p, s in sorted_imgs[:5]]

                context = {
                    "celebrity": post.get("celebrity", ""),
                    "text_preview": (post.get("text") or "")[:100],
                    "top_images": top3,
                }
                decision = self._call_llm(
                    STEP_SCORE,
                    """从评分最高的几张图片中选出最适合做公众号封面的 1 张。

                    考量维度：
                    1. 图片构图 — 是否适合做封面（横版、主体突出）
                    2. 视觉吸引力 — 色彩、清晰度、美观度
                    3. 内容相关性 — 是否与文章主题匹配

                    回复格式：
                    - params.cover_path: string, 选中的封面图片路径
                    - 选择你认为最好的一张""",
                    context,
                )

                chosen = decision.get("params", {}).get("cover_path", "")
                if chosen and chosen in img_scores:
                    post["cover"] = chosen
                    self._emit_decision(
                        STEP_SCORE,
                        f"AI 为「{post.get('celebrity', '')}」选择了封面",
                        decision.get("reasoning", "") or "",
                    )

            # ── AI 决策：根据标题内容严格过滤 ──
            filtered_posts = []
            for post in posts:
                text = post.get("text", "") or ""
                title = post.get("title", "") or ""
                content_preview = (title or text)[:300]

                if not content_preview.strip():
                    post["_skip"] = True
                    post["_skip_reason"] = "无标题和正文内容"
                    self._emit_decision(STEP_SCORE, f"跳过无内容帖子", "")
                    continue

                image_count = len(post.get("local_images", []))
                min_images = self.config.min_images_per_post

                if image_count < min_images:
                    post["_skip"] = True
                    post["_skip_reason"] = f"图片不足（{image_count}/{min_images}）"
                    self._emit_decision(
                        STEP_SCORE,
                        f"跳过图片不足的帖子 — {post['_skip_reason']}",
                        "",
                    )
                    continue

                # ── 关键词快速预过滤（不消耗 token）──
                text_lower = content_preview.lower()
                skip_keywords = [
                    "时政", "突发",
                    "投票", "抽奖",
                ]
                skip_match = next((kw for kw in skip_keywords if kw in text_lower), None)
                if skip_match:
                    post["_skip"] = True
                    post["_skip_reason"] = f"含广告/推广/转发关键词「{skip_match}」"
                    self._emit_decision(
                        STEP_SCORE,
                        f"跳过广告/推广内容: {content_preview[:40]}...",
                        post["_skip_reason"],
                    )
                    continue

                context = {
                    "content_preview": content_preview[:300],
                    "celebrity": post.get("celebrity", ""),
                    "scene": post.get("scene", ""),
                    "image_count": image_count,
                }
                decision = self._call_llm(
                    STEP_SCORE,
                    """判断这条帖子内容是否适合发布到以「美女图片/穿搭/美妆/日常分享」为主题的微信公众号。

                    必须拒绝以下类型（返回 publish_worthy=false）：
                    1. 明星代言/推广/广告 — 任何品牌合作、推广、带货内容
                    2. 时政新闻、社会热点、政治评论 — 包括转发他人观点
                    3. 纯转发内容 — 没有原创描述，只是"转发微博/动态"
                    4. 抽奖/投票/福利活动 — 无实质内容
                    5. 内容质量低 — 纯标题党、无意义片段、凑字数

                    适合保留的内容（返回 publish_worthy=true）：
                    - 明星/博主的日常穿搭、美妆分享、生活记录
                    - 有实质内容的美图分享、场景记录
                    - 有个人观点或感受的描述（非转发）

                    注意：宁可漏掉一些，也不要发布不相关内容。

                    回复格式：
                    - publish_worthy: true / false
                    - reason: string，判断理由""",
                    context,
                )

                if not decision.get("params", {}).get("publish_worthy", True):
                    post["_skip"] = True
                    post["_skip_reason"] = decision.get("reasoning", "") or decision.get("params", {}).get("reason", "")
                    self._emit_decision(
                        STEP_SCORE,
                        f"AI 判定帖子不适合发布: {content_preview[:40]}...",
                        post["_skip_reason"],
                    )
                    continue

                filtered_posts.append(post)

            skipped_count = len(posts) - len(filtered_posts)
            if skipped_count:
                self._emit_decision(
                    STEP_SCORE,
                    f"内容过滤: 保留 {len(filtered_posts)} 条，跳过 {skipped_count} 条",
                    "",
                )
            posts[:] = filtered_posts

        self._emit_decision(STEP_SCORE, f"完成 {len(scores)} 张图片评分",
                            f"Vision API: {vision_count} 张，启发式: {heuristic_count} 张")

        self._emit_progress(STEP_SCORE, len(scores), len(all_paths), "评分完成")
        self._emit(EVENT_STEP_COMPLETE, STEP_SCORE, {
            "step": STEP_SCORE,
            "result": {"scored": len(scores), "vision": vision_count, "heuristic": heuristic_count},
        })

    # ── Step 5: 生成内容 ────────────────────────────────
    def _step_generate_content(self, posts: List[dict]) -> None:
        self._check_cancelled()
        self._emit(EVENT_STEP_START, STEP_GENERATE, {
            "step": STEP_GENERATE,
            "name": STEP_NAMES[STEP_GENERATE],
            "reasoning": "AI 正在为每条帖子生成标题和正文...",
        })

        from services.ai import generate_content
        from services.extensions import select_cover

        for i, post in enumerate(posts):
            self._check_cancelled()

            images = post.get("local_images", [])
            if not images:
                continue

            try:
                title, desc = generate_content(post.get("text", ""))
                cover = post.get("cover") or select_cover(images)

                post["title"] = title
                post["desc"] = desc
                post["cover"] = cover

                # 关联图片平均分作为帖子得分
                scores = post.get("image_scores", {})
                if scores:
                    avg = sum(
                        s.get("score", 0) for s in scores.values()
                    ) / max(len(scores), 1)
                    post["score"] = round(avg)
                else:
                    post["score"] = 0

                # ── AI 决策：评审并优化标题 ──
                if self.config.ai_decisions:
                    context = {
                        "original_text_preview": (post.get("text") or "")[:200],
                        "generated_title": title,
                        "celebrity": post.get("celebrity", ""),
                        "scene": post.get("scene", ""),
                    }
                    decision = self._call_llm(
                        STEP_GENERATE,
                        """评审上面生成的标题，判断是否需要优化。

                        考量维度：
                        1. 吸引力 — 标题是否足够吸引人点击
                        2. 准确性 — 标题是否准确反映内容
                        3. 合规性 — 避免标题党、敏感词
                        4. 长度 — 公众号标题建议 15-25 字

                        如果当前标题已经很好，直接保留。

                        回复格式：
                        - action: "keep" 保留原标题 / "refine" 使用优化后的标题
                        - params.refined_title: string (仅当 action 为 refine 时)
                        - 如果优化，给出优化后的完整标题""",
                        context,
                    )

                    act = decision.get("action", "keep")
                    if act == "refine":
                        refined = decision.get("params", {}).get("refined_title", "").strip()
                        if refined and len(refined) > 3:
                            old_title = post["title"]
                            post["title"] = refined
                            self._emit_decision(
                                STEP_GENERATE,
                                f"标题优化: {old_title[:20]}... → {refined[:20]}...",
                                decision.get("reasoning", "") or "",
                            )

                # 拼接艺人前缀: "孙怡 | 今晚一起听轻轻的亲"
                celebrity_name = post.get("celebrity", "")
                if celebrity_name and post["title"]:
                    raw = post["title"]
                    if raw.startswith(celebrity_name):
                        raw = raw[len(celebrity_name):].lstrip(" |：,，")
                    post["title"] = f"{celebrity_name} | {raw}"

                self._emit_progress(STEP_GENERATE, i + 1, len(posts), post["title"])

            except Exception as err:
                logger.error("内容生成失败: %s", err)
                self._emit(EVENT_STEP_ERROR, STEP_GENERATE, {
                    "step": STEP_GENERATE,
                    "error": str(err),
                })
                post["title"] = post.get("title") or "未命名"
                post["desc"] = post.get("desc") or ""
                post["cover"] = images[0] if images else ""
                celebrity_name = post.get("celebrity", "")
                if celebrity_name and not post["title"].startswith(celebrity_name):
                    post["title"] = f"{celebrity_name} | {post['title']}"
                continue

        self._emit(EVENT_STEP_COMPLETE, STEP_GENERATE, {
            "step": STEP_GENERATE,
            "result": {"generated": len([p for p in posts if p.get("title")])},
        })

    # ── Step 6: 加入队列 ────────────────────────────────
    def _step_enqueue(self, posts: List[dict]) -> None:
        self._check_cancelled()
        self._emit(EVENT_STEP_START, STEP_ENQUEUE, {
            "step": STEP_ENQUEUE,
            "name": STEP_NAMES[STEP_ENQUEUE],
            "reasoning": "将处理完成的帖子加入发布队列...",
        })

        from desktop.app_state import app_state

        def _to_relative(path: str) -> str:
            """将绝对路径转为相对于 DOWNLOAD_DIR 的相对路径。"""
            try:
                return str(Path(path).relative_to(DOWNLOAD_DIR))
            except ValueError:
                return path

        added = 0
        for i, post in enumerate(posts):
            self._check_cancelled()

            images = post.get("local_images", [])
            if not images:
                continue

            try:
                cover = post.get("cover", "")
                # 封面图放在第一张，与发布队列逻辑一致
                if cover and cover in images:
                    images = [cover] + [img for img in images if img != cover]
                rel_images = [_to_relative(img) for img in images]
                rel_cover = _to_relative(cover) if cover else ""
                item = {
                    "title": post.get("title", ""),
                    "desc": post.get("desc", ""),
                    "images": rel_images,
                    "cover": rel_cover or (rel_images[0] if rel_images else ""),
                    "celebrity": post.get("celebrity", ""),
                    "status": "queued",
                    "account_id": self.config.account_id or "",
                    "type": "image",
                    "source": f"pipeline_{self.run_id}",
                    "score": post.get("score", 0),
                }
                app_state.add_to_queue(item)
                self._processed_items.append({
                    **post,
                    "status": "queued",
                })
                added += 1
                self._emit_progress(STEP_ENQUEUE, i + 1, len(posts),
                                    post.get("title", ""))

            except Exception as err:
                logger.error("加入队列失败: %s", err)
                self._emit(EVENT_STEP_ERROR, STEP_ENQUEUE, {
                    "step": STEP_ENQUEUE,
                    "error": str(err),
                })
                continue

        self._emit_decision(STEP_ENQUEUE, f"{added} 条已加入队列",
                            f"共有 {added} 条内容进入发布队列")
        self._emit(EVENT_STEP_COMPLETE, STEP_ENQUEUE, {
            "step": STEP_ENQUEUE,
            "result": {"added": added},
        })

    # ── Step 7: 发布 ────────────────────────────────────
    def _step_publish(self) -> None:
        if self.config.dry_run:
            self._emit_decision(STEP_PUBLISH, "DRY-RUN 模式，跳过发布",
                                "dry_run=True，不会执行实际发布操作")
            self._emit(EVENT_STEP_COMPLETE, STEP_PUBLISH, {
                "step": STEP_PUBLISH,
                "result": {"message": "DRY-RUN 模式，跳过发布", "published": 0},
            })
            return

        self._check_cancelled()
        self._emit(EVENT_STEP_START, STEP_PUBLISH, {
            "step": STEP_PUBLISH,
            "name": STEP_NAMES[STEP_PUBLISH],
            "reasoning": "准备发布到微信公众号...",
        })

        from desktop.app_state import app_state
        from services.wechat import publish_article

        queue_items = app_state.get_queue()
        pipeline_items = [q for q in queue_items
                          if q.get("source", "").startswith(f"pipeline_{self.run_id}")]

        if not pipeline_items:
            self._emit_decision(STEP_PUBLISH, "没有待发布的内容", "")
            return

        # ── AI 决策：发布前合规与质量检查 ──
        if self.config.ai_decisions:
            context = {
                "items": [
                    {
                        "title": q.get("title", ""),
                        "text_preview": (q.get("desc", "") or "")[:100],
                        "image_count": len(q.get("images", [])),
                        "celebrity": q.get("celebrity", ""),
                    }
                    for q in pipeline_items
                ],
            }
            decision = self._call_llm(
                STEP_PUBLISH,
                """对即将发布的内容进行合规与质量检查。

                检查要点：
                1. 标题是否含有敏感词、违禁词
                2. 内容是否合规、不违反公众号规则
                3. 整体质量是否达到发布标准

                回复格式：
                - action: "proceed" 通过 / "stop" 不通过
                - params.blocked_indices: list[int], 被拦截的内容索引
                - 如果某篇内容有问题，说明原因""",
                context,
            )

            act = decision.get("action", "proceed")
            blocked = decision.get("params", {}).get("blocked_indices", [])
            if act == "stop" or blocked:
                reasoning = decision.get("reasoning", "") or ""
                self._emit_decision(
                    STEP_PUBLISH,
                    f"AI 合规检查拦截了 {len(blocked)} 篇内容" if blocked else "AI 合规检查未通过",
                    reasoning,
                )
                if blocked:
                    pipeline_items = [q for i, q in enumerate(pipeline_items)
                                      if i not in blocked]
                else:
                    return

        # checkpoint: 请求用户确认
        if self.config.require_confirm:
            from desktop.routers.pipeline import pipeline_confirm_events
            confirm_evt = Event()
            pipeline_confirm_events[self.run_id] = confirm_evt

            self._emit(EVENT_CHECKPOINT, STEP_PUBLISH, {
                "step": STEP_PUBLISH,
                "message": f"即将发布 {len(pipeline_items)} 篇内容到微信公众号，请确认",
                "pipeline_run_id": self.run_id,
                "items": [
                    {
                        "title": q.get("title", ""),
                        "desc": (q.get("desc", "") or "")[:300],
                        "celebrity": q.get("celebrity", ""),
                        "images": len(q.get("local_images", q.get("images", []))),
                        "score": q.get("score", 0),
                        "cover": q.get("cover", ""),
                        "image_list": q.get("local_images", q.get("images", [])),
                    }
                    for q in pipeline_items
                ],
            })

            confirmed = confirm_evt.wait(timeout=600)
            if not confirmed:
                self._emit_decision(STEP_PUBLISH, "发布确认超时，取消发布", "")
                return

        published = 0
        for i, item in enumerate(pipeline_items):
            self._check_cancelled()

            try:
                result = publish_article(
                    title=item.get("title", ""),
                    content=item.get("desc", ""),
                    images=item.get("images", []),
                    cover=item.get("cover"),
                    dry_run=False,
                    save_draft=True,
                    account_id=self.config.account_id or item.get("account_id"),
                    on_scan_needed=lambda: self._emit_progress(
                        STEP_PUBLISH, i + 1, len(pipeline_items),
                        "请在弹出的浏览器窗口中扫码登录",
                    ),
                    on_confirm_needed=lambda t: True,
                    on_log=lambda msg: self._emit_progress(
                        STEP_PUBLISH, i + 1, len(pipeline_items), msg
                    ),
                )

                if result.get("success"):
                    published += 1
                    item["status"] = "saved_to_wechat"
                    app_state.update_queue_item_by_id(item["id"], {"status": "saved_to_wechat"})

                    for pi in self._processed_items:
                        if pi.get("title") == item.get("title"):
                            pi["published"] = True
                            pi["status"] = "saved_to_wechat"
                            break
                else:
                    self._emit(EVENT_STEP_ERROR, STEP_PUBLISH, {
                        "step": STEP_PUBLISH,
                        "error": f"发布失败: {result.get('message', '')}",
                    })

                self._emit_progress(STEP_PUBLISH, i + 1, len(pipeline_items),
                                    f"{item.get('title', '')}")

            except Exception as err:
                logger.error("发布失败: %s", err)
                self._emit(EVENT_STEP_ERROR, STEP_PUBLISH, {
                    "step": STEP_PUBLISH,
                    "error": str(err),
                })
                continue

            if i < len(pipeline_items) - 1:
                sleep_sec = settings.min_publish_interval + random.randint(0, 3)
                time.sleep(sleep_sec)

        self._emit_decision(STEP_PUBLISH, f"已发布 {published}/{len(pipeline_items)} 篇",
                            f"成功发布 {published} 篇到微信公众号")
        self._emit(EVENT_STEP_COMPLETE, STEP_PUBLISH, {
            "step": STEP_PUBLISH,
            "result": {"published": published, "total": len(pipeline_items)},
        })
