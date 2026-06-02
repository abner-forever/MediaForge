"""SSE（Server-Sent Events）流式响应工具函数。

消除各登录接口中重复的 Queue + ThreadPoolExecutor + event_stream 模式。
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from queue import Empty, Queue
from typing import Any, Callable, Generator

from fastapi.responses import StreamingResponse


def create_sse_response(
    task_fn: Callable[[Queue], None],
    *,
    max_workers: int = 1,
    on_done: Callable[[tuple], None] | None = None,
) -> StreamingResponse:
    """通用 SSE 流式响应：提交后台任务 → 轮询 Queue → yield SSE 帧。

    task_fn 接收一个 Queue 实例，通过 msg_queue.put((type, ...)) 推送消息。
    支持的消息类型：
      - ("progress", message)  → 进度消息
      - ("token", text)        → 流式 token（细粒度，不终止流）
      - ("message", text)      → AI 解释文本（Agent 模式，不终止流）
      - ("content", text)      → 文章内容（Agent 模式，不终止流）
      - ("done", ...)          → 完成，支持 dict 或位置参数
      - ("error", message)     → 错误消息

    Args:
        task_fn: 后台任务函数，签名 fn(msg_queue: Queue) -> None
        max_workers: 线程池大小，默认 1
        on_done: 收到 done 消息时的回调，接收原始元组（在后台线程中执行）
    """
    msg_queue: Queue = Queue()
    ThreadPoolExecutor(max_workers).submit(task_fn, msg_queue)

    def event_stream() -> Generator[str, None, None]:
        while True:
            try:
                msg = msg_queue.get(timeout=0.5)
            except Empty:
                yield ": keepalive\n\n"
                continue

            msg_type = msg[0]
            if msg_type == "progress":
                yield f"data: {json.dumps({'type': 'progress', 'message': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg_type == "token":
                yield f"data: {json.dumps({'type': 'token', 'content': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg_type == "message":
                yield f"data: {json.dumps({'type': 'message', 'content': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg_type == "content":
                yield f"data: {json.dumps({'type': 'content', 'content': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg_type == "done":
                if on_done:
                    try:
                        on_done(msg)
                    except Exception:
                        pass
                if len(msg) > 1 and isinstance(msg[1], dict):
                    data = msg[1]
                else:
                    data = {}
                yield f"data: {json.dumps({'type': 'done', **data}, ensure_ascii=False)}\n\n"
                break
            elif msg_type == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")
