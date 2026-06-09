import logging
import sys
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path


# ── 文件日志配置 ──────────────────────────────────────
_FILE_LOG_ENABLED = False
_LOG_CLEANUP_DAYS = 7  # 日志文件保留天数


def _cleanup_old_logs(log_dir: Path) -> None:
    """删除超过 LOG_CLEANUP_DAYS 天的日志文件（app.log 备份、crash.log、run 审计日志）。"""
    now = time.time()
    max_age = _LOG_CLEANUP_DAYS * 86400  # 秒

    patterns = ["app.log*", "crash.log*", "runs/*.jsonl"]
    for pattern in patterns:
        for f in log_dir.glob(pattern):
            try:
                if now - f.stat().st_mtime > max_age:
                    f.unlink(missing_ok=True)
            except Exception:
                pass

    # 清理 runs 空目录
    runs_dir = log_dir / "runs"
    if runs_dir.exists():
        try:
            if not any(runs_dir.iterdir()):
                runs_dir.rmdir()
        except Exception:
            pass


def setup_file_logging(log_dir: str | Path) -> str:
    """配置按天轮转的文本日志到 log_dir/app.log。

    - 5 MB 每个文件，保留最近 3 个备份
    - 自动清理超过 7 天的旧日志文件
    - 捕获所有 INFO 及以上级别的日志
    - 返回日志文件路径
    """
    global _FILE_LOG_ENABLED
    if _FILE_LOG_ENABLED:
        return ""

    log_dir = Path(log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "app.log"

    # 启动时清理过期日志
    _cleanup_old_logs(log_dir)

    handler = RotatingFileHandler(
        log_path, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8",
    )
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)

    _FILE_LOG_ENABLED = True
    return str(log_path)


def get_logger(name: str = "MediaForge") -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    return logger


# 模块级默认 logger，供 `from utils.logger import log` 使用
log = get_logger()
