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
) -> StreamingResponse:
    """通用 SSE 流式响应：提交后台任务 → 轮询 Queue → yield SSE 帧。

    task_fn 接收一个 Queue 实例，通过 msg_queue.put((type, ...)) 推送消息。
    支持的消息类型：
      - ("progress", message)  → 进度消息
      - ("done", data_dict)    → 完成，data_dict 会序列化为 JSON
      - ("error", message)     → 错误消息

    Args:
        task_fn: 后台任务函数，签名 fn(msg_queue: Queue) -> None
        max_workers: 线程池大小，默认 1
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
            elif msg_type == "done":
                data = msg[1] if len(msg) > 1 and isinstance(msg[1], dict) else {}
                yield f"data: {json.dumps({'type': 'done', **data}, ensure_ascii=False)}\n\n"
                break
            elif msg_type == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")
