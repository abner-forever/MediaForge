import argparse
import random
import time
from datetime import datetime
from typing import Dict, Set

from config import POSTS_CACHE_PATH, ensure_dirs, settings
from services.ai import generate_content
from services.downloader import download_images
from services.extensions import build_html, select_cover
from services.platforms import get_default_platform, get_platform
from utils.audit import append_audit, create_run_log_path
from utils.file import hash_text, read_json, write_json
from utils.logger import get_logger


logger = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    default_platform = get_default_platform()
    platform_svc = get_platform(default_platform)
    default_mode = platform_svc.meta.default_fetch_mode if platform_svc else ""

    parser = argparse.ArgumentParser(description="MediaForge 自动化发布工具")
    parser.add_argument("--platform", type=str, default=default_platform, help="平台选择 (weibo, toutiao)")
    parser.add_argument("--mode", type=str, default=None, help=f"平台抓取模式（默认：{default_mode}）")
    parser.add_argument("--limit", type=int, default=settings.post_limit, help="限制处理条数")
    parser.add_argument("--pages", type=int, default=settings.weibo_pages, help="抓取页数")
    parser.add_argument("--dry-run", action="store_true", help="不发布，只打印")
    parser.add_argument(
        "--ignore-post-cache",
        action="store_true",
        help="忽略 data/posts.json 去重缓存（仍会写回缓存；用于按新目录结构重新下载图片）",
    )
    return parser.parse_args()


def _load_cache() -> Dict[str, Set[str]]:
    """
    兼容历史缓存格式：
    - 老格式: ["hash1", ...]
    - 新格式: {"post_ids": [...], "post_hashes": [...]}
    """
    raw = read_json(POSTS_CACHE_PATH, default={})
    if isinstance(raw, list):
        return {"post_ids": set(), "post_hashes": set(str(v) for v in raw)}
    if isinstance(raw, dict):
        return {
            "post_ids": set(str(v) for v in raw.get("post_ids", [])),
            "post_hashes": set(str(v) for v in raw.get("post_hashes", [])),
        }
    return {"post_ids": set(), "post_hashes": set()}


def _save_cache(cache: Dict[str, Set[str]]) -> None:
    write_json(
        POSTS_CACHE_PATH,
        {
            "post_ids": sorted(cache["post_ids"]),
            "post_hashes": sorted(cache["post_hashes"]),
        },
    )


def main() -> None:
    ensure_dirs()
    args = parse_args()
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    audit_path = create_run_log_path(run_id)

    limit = max(1, min(args.limit, 3))  # 风控：最多 1~3 篇
    pages = max(1, args.pages)

    platform_svc = get_platform(args.platform)
    if not platform_svc:
        logger.error("未知平台: %s，可用平台: %s", args.platform, list(get_platform.__globals__.get("_PLATFORM_REGISTRY", {}).keys()))
        return
    fetch_mode = args.mode or platform_svc.meta.default_fetch_mode

    logger.info(
        "启动任务 平台=%s 模式=%s limit=%s pages=%s dry_run=%s",
        platform_svc.meta.name,
        fetch_mode,
        limit,
        pages,
        args.dry_run,
    )
    append_audit(
        audit_path,
        "run_started",
        {
            "run_id": run_id,
            "platform": args.platform,
            "mode": fetch_mode,
            "limit": limit,
            "pages": pages,
            "dry_run": args.dry_run,
        },
    )

    try:
        posts = platform_svc.fetch_posts(mode=fetch_mode, max_pages=pages)
    except Exception as err:
        logger.error("抓取失败（%s）: %s", platform_svc.meta.name, err)
        append_audit(audit_path, "fetch_failed", {"error": str(err)})
        return

    if not posts:
        logger.info("没有可处理帖子，流程结束")
        append_audit(audit_path, "fetch_empty", {})
        return

    cache = _load_cache()

    handled = 0
    for post in posts:
        if handled >= limit:
            break
        post_id = str(post.get("id") or "")
        post_key = hash_text((post.get("id") or "") + post.get("text", ""))
        if not args.ignore_post_cache:
            if post_id and post_id in cache["post_ids"]:
                logger.info("帖子已处理（按ID命中缓存），跳过: %s", post_id)
                continue
            if post_key in cache["post_hashes"]:
                logger.info("帖子已处理（按hash命中缓存），跳过")
                continue
        try:
            folder_id = (post.get("id") or "").strip() or post_key[:12]
            images, dropped_count = download_images(
                post["images"],
                celebrity=post.get("celebrity") or "未命名",
                scene=post.get("scene") or "日常",
                post_slug=folder_id,
                prefix=post_key[:8],
                overwrite=False,
            )
            if not images:
                logger.info("帖子无可用图片，跳过")
                append_audit(
                    audit_path,
                    "post_skipped_no_images",
                    {"post_id": post_id, "celebrity": post.get("celebrity", "")},
                )
                continue
            if settings.watermark_strict_mode and len(images) < max(1, settings.min_clean_images):
                if settings.allow_watermark_fallback:
                    logger.info(
                        "无水印图数量不足（保留 %s，最低要求 %s，过滤约 %s），开启了 fallback，继续使用当前图片",
                        len(images),
                        settings.min_clean_images,
                        dropped_count,
                    )
                else:
                    logger.info(
                        "无水印图数量不足（保留 %s，最低要求 %s，过滤约 %s），按严格模式跳过该帖子",
                        len(images),
                        settings.min_clean_images,
                        dropped_count,
                    )
                    append_audit(
                        audit_path,
                        "post_skipped_strict_watermark",
                        {
                            "post_id": post_id,
                            "clean_images": len(images),
                            "required": settings.min_clean_images,
                        },
                    )
                    continue

            title, desc = generate_content(post.get("text", ""))
            content = desc
            cover = select_cover(images)
            logger.info(
                "准备发布: title=%s, cover=%s, 艺人=%s 场景=%s 来源=%s",
                title,
                cover,
                post.get("celebrity", ""),
                post.get("scene", ""),
                post.get("source", ""),
            )
            if args.dry_run:
                logger.info(
                    "[DRY-RUN] %s | %s | images=%s | %s | scene=%s | %s",
                    title,
                    desc,
                    len(images),
                    post.get("celebrity", ""),
                    post.get("scene", ""),
                    post.get("source", ""),
                )
            else:
                if settings.no_publish_without_confirm:
                    confirm = input(f"确认发布《{title}》? [y/N]: ").strip().lower()
                    if confirm != "y":
                        logger.info("用户取消发布: %s", title)
                        continue
                from services.wechat import publish_article

                publish_article(title=title, content=content, images=images, dry_run=False)

            handled += 1
            append_audit(
                audit_path,
                "post_processed",
                {
                    "post_id": post_id,
                    "title": title,
                    "images_kept": len(images),
                    "celebrity": post.get("celebrity", ""),
                    "scene": post.get("scene", ""),
                },
            )
            if post_id:
                cache["post_ids"].add(post_id)
            cache["post_hashes"].add(post_key)
            _save_cache(cache)
            if handled < limit:
                sleep_seconds = settings.min_publish_interval + random.randint(0, 3)
                logger.info("等待 %s 秒后继续", sleep_seconds)
                time.sleep(sleep_seconds)
        except Exception as err:
            logger.error("处理帖子失败，继续下一条: %s", err)
            append_audit(audit_path, "post_failed", {"post_id": post_id, "error": str(err)})
            continue

    logger.info("任务结束，成功处理 %s 篇", handled)
    append_audit(audit_path, "run_finished", {"handled": handled, "run_id": run_id})


if __name__ == "__main__":
    main()
