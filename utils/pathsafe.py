import re


def sanitize_segment(name: str, *, max_len: int = 64) -> str:
    raw = (name or "").strip() or "未命名"
    cleaned = re.sub(r'[\x00\\/:*?"<>|\n\r\t]+', "_", raw)
    cleaned = cleaned.strip("._ ")
    cleaned = cleaned[:max_len].rstrip(". ") or "未命名"
    return cleaned
