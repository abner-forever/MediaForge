"""发布数据分析 API。"""

import csv
import io
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from desktop.app_state import app_state
from desktop.sse_helpers import create_sse_response
from services.ai.client import _call_ai_stream
from services.ai.prompts import EFFECTS_ANALYSIS_TEMPLATE

router = APIRouter(tags=["effects"])


# ── 聚合分析端点（必须在 {item_id} 路由之前定义）────────


def _parse_publish_time(raw: str | None) -> datetime | None:
    """尝试解析 publish_time 字段，兼容多种格式。"""
    if not raw:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw[:len(fmt.replace('%', 'X'))], fmt)
        except (ValueError, IndexError):
            continue
    # ISO 格式带时区
    try:
        return datetime.fromisoformat(raw)
    except (ValueError, TypeError):
        return None


@router.get("/api/effects/summary")
async def effects_summary():
    """聚合概览：总阅读/总点赞/平均值/最佳时段/艺人排行。"""
    effects = app_state.get_publish_effects()
    if not effects:
        return {
            "total_posts": 0, "total_reads": 0, "total_likes": 0,
            "avg_reads": 0, "avg_likes": 0,
            "best_publish_hour": 0, "best_day_of_week": 0,
            "top_celebrities": [],
        }

    total_posts = len(effects)
    total_reads = 0
    total_likes = 0
    total_comments = 0
    total_shares = 0
    total_favorites = 0
    hour_reads: dict[int, int] = defaultdict(int)
    dow_reads: dict[int, int] = defaultdict(int)
    celeb_data: dict[str, list[int]] = defaultdict(list)

    for item in effects.values():
        reads = item.get("reads", 0) or 0
        likes = item.get("likes", 0) or 0
        total_reads += reads
        total_likes += likes
        total_comments += (item.get("comment_num") or item.get("comments") or 0)
        total_shares += (item.get("shares") or 0)
        total_favorites += (item.get("favorites") or 0)

        dt = _parse_publish_time(item.get("publish_time"))
        if dt:
            hour_reads[dt.hour] += reads
            dow_reads[dt.weekday()] += reads

        celeb = item.get("celebrity")
        if celeb:
            celeb_data[celeb].append(reads)

    best_hour = max(hour_reads, key=hour_reads.get) if hour_reads else 0
    best_dow = max(dow_reads, key=dow_reads.get) if dow_reads else 0

    top_celebrities = sorted(
        [
            {"name": name, "avg_reads": round(sum(vals) / len(vals)), "count": len(vals)}
            for name, vals in celeb_data.items()
        ],
        key=lambda x: x["avg_reads"],
        reverse=True,
    )[:10]

    return {
        "total_posts": total_posts,
        "total_reads": total_reads,
        "total_likes": total_likes,
        "total_comments": total_comments,
        "total_shares": total_shares,
        "total_favorites": total_favorites,
        "avg_reads": round(total_reads / total_posts) if total_posts else 0,
        "avg_likes": round(total_likes / total_posts) if total_posts else 0,
        "best_publish_hour": best_hour,
        "best_day_of_week": best_dow,
        "top_celebrities": top_celebrities,
    }


@router.get("/api/effects/trend")
async def effects_trend(days: int = Query(30)):
    """趋势数据：按天聚合阅读量、点赞数、发布数。days=0 表示全部。"""
    effects = app_state.get_publish_effects()
    today = datetime.now().date()

    if days > 0:
        start = today - timedelta(days=days - 1)
    else:
        # 全部：从最早发布日开始
        earliest = today
        for item in effects.values():
            dt = _parse_publish_time(item.get("publish_time"))
            if dt and dt.date() < earliest:
                earliest = dt.date()
        start = earliest

    # 初始化每日桶
    daily: dict[str, dict] = {}
    d = start
    while d <= today:
        daily[d.isoformat()] = {
            "date": d.isoformat(), "reads": 0, "likes": 0, "posts": 0,
            "comments": 0, "shares": 0, "favorites": 0,
        }
        d += timedelta(days=1)

    for item in effects.values():
        dt = _parse_publish_time(item.get("publish_time"))
        if not dt:
            continue
        key = dt.date().isoformat()
        if key in daily:
            daily[key]["reads"] += item.get("reads", 0) or 0
            daily[key]["likes"] += item.get("likes", 0) or 0
            daily[key]["posts"] += 1
            daily[key]["comments"] += (item.get("comment_num") or item.get("comments") or 0)
            daily[key]["shares"] += (item.get("shares") or 0)
            daily[key]["favorites"] += (item.get("favorites") or 0)

    return {"trend": [daily[k] for k in sorted(daily)]}


@router.get("/api/effects/compare")
async def effects_compare():
    """多维度对比：按来源平台、内容类型、艺人分组聚合。"""
    effects = app_state.get_publish_effects()

    def _group_by(key_field: str) -> list[dict]:
        groups: dict[str, dict] = {}
        for item in effects.values():
            k = item.get(key_field) or "未知"
            if k not in groups:
                groups[k] = {"key": k, "reads": 0, "likes": 0, "posts": 0}
            groups[k]["reads"] += item.get("reads", 0) or 0
            groups[k]["likes"] += item.get("likes", 0) or 0
            groups[k]["posts"] += 1
        return sorted(groups.values(), key=lambda x: x["reads"], reverse=True)

    return {
        "by_source_platform": _group_by("source_platform"),
        "by_content_type": _group_by("content_type"),
        "by_celebrity": _group_by("celebrity"),
    }


@router.get("/api/effects/celebrity-rank")
async def celebrity_rank(days: int = Query(0)):
    """艺人排行榜，支持按天数筛选。days=0 表示全部。"""
    effects = app_state.get_publish_effects()
    cutoff = None
    if days > 0:
        cutoff = datetime.now() - timedelta(days=days)

    celeb_data: dict[str, list[int]] = defaultdict(list)
    for item in effects.values():
        if cutoff:
            dt = _parse_publish_time(item.get("publish_time"))
            if not dt or dt < cutoff:
                continue
        celeb = item.get("celebrity")
        if celeb:
            celeb_data[celeb].append(item.get("reads", 0) or 0)

    ranking = sorted(
        [
            {"name": name, "avg_reads": round(sum(vals) / len(vals)), "count": len(vals)}
            for name, vals in celeb_data.items()
        ],
        key=lambda x: x["avg_reads"],
        reverse=True,
    )[:10]

    return {"celebrities": ranking}


@router.get("/api/effects/funnel")
async def effects_funnel(days: int = Query(0), item_id: str = Query("")):
    """互动漏斗数据，支持按天数和单篇文章筛选。days=0 表示全部。"""
    effects = app_state.get_publish_effects()
    cutoff = None
    if days > 0:
        cutoff = datetime.now() - timedelta(days=days)

    total_reads = 0
    total_likes = 0
    total_shares = 0
    total_favorites = 0
    total_comments = 0

    for key, item in effects.items():
        if item_id and key != item_id:
            continue
        if cutoff:
            dt = _parse_publish_time(item.get("publish_time"))
            if not dt or dt < cutoff:
                continue
        total_reads += item.get("reads", 0) or 0
        total_likes += item.get("likes", 0) or 0
        total_shares += item.get("shares", 0) or 0
        total_favorites += item.get("favorites", 0) or 0
        total_comments += (item.get("comment_num") or item.get("comments") or 0)

    return {
        "total_reads": total_reads,
        "total_likes": total_likes,
        "total_shares": total_shares,
        "total_favorites": total_favorites,
        "total_comments": total_comments,
    }


@router.get("/api/effects/article-options")
async def article_options():
    """返回所有文章列表（按发布时间降序，标题去重），用于筛选下拉。"""
    effects = app_state.get_publish_effects()
    seen: dict[str, dict] = {}
    for k, v in effects.items():
        title = (v.get("title") or "").strip()
        if not title:
            continue
        pt = v.get("publish_time", "")
        if title not in seen or pt > seen[title]["publish_time"]:
            seen[title] = {"item_id": k, "title": title, "publish_time": pt}
    articles = sorted(seen.values(), key=lambda x: x["publish_time"], reverse=True)
    return {"articles": articles}


@router.get("/api/effects/top-articles")
async def top_articles(limit: int = Query(10, ge=1, le=50)):
    """按阅读量降序返回 Top N 文章。"""
    effects = app_state.get_publish_effects()
    articles = sorted(
        [
            {
                "item_id": k,
                "title": v.get("title", ""),
                "reads": v.get("reads", 0) or 0,
                "likes": v.get("likes", 0) or 0,
                "shares": v.get("shares", 0) or 0,
                "favorites": v.get("favorites", 0) or 0,
                "comments": (v.get("comment_num") or v.get("comments") or 0),
                "celebrity": v.get("celebrity", ""),
                "source_platform": v.get("source_platform", ""),
                "publish_time": v.get("publish_time", ""),
                "image_count": v.get("image_count", 0) or 0,
            }
            for k, v in effects.items()
            if (v.get("reads", 0) or 0) > 0
        ],
        key=lambda x: x["reads"],
        reverse=True,
    )[:limit]
    return {"articles": articles}


@router.get("/api/effects/image-analysis")
async def image_analysis():
    """按图片数量分组统计平均阅读量。"""
    effects = app_state.get_publish_effects()
    groups: dict[int, list[int]] = defaultdict(list)
    for item in effects.values():
        ic = item.get("image_count") or 0
        reads = item.get("reads", 0) or 0
        if reads > 0:
            groups[ic].append(reads)
    result = sorted(
        [
            {"image_count": ic, "avg_reads": round(sum(vals) / len(vals)), "count": len(vals)}
            for ic, vals in groups.items()
        ],
        key=lambda x: x["image_count"],
    )
    return {"items": result}


def _build_data_summary(days: int) -> str:
    """增强版数据摘要：含多周期对比、逐日趋势、环比变化、艺人效率变化。"""
    effects = app_state.get_publish_effects()
    if not effects:
        return "暂无数据。"

    today = datetime.now().date()

    # ── 辅助：按日期范围筛选 ────────────────────────────
    def _filter_in_range(start: date | None, end: date | None) -> dict:
        """筛选 publish_time 在 [start, end) 范围内的记录。"""
        result = {}
        for k, v in effects.items():
            dt = _parse_publish_time(v.get("publish_time"))
            if not dt:
                continue
            d = dt.date()
            if start and d < start:
                continue
            if end and d >= end:
                continue
            result[k] = v
        return result

    def _aggregate(items: dict) -> dict:
        """对一组效果记录做聚合统计。"""
        total = len(items)
        total_reads = sum(v.get("reads", 0) or 0 for v in items.values())
        total_likes = sum(v.get("likes", 0) or 0 for v in items.values())
        total_shares = sum(v.get("shares", 0) or 0 for v in items.values())
        total_favorites = sum(v.get("favorites", 0) or 0 for v in items.values())
        total_comments = sum((v.get("comment_num") or v.get("comments") or 0) for v in items.values())
        avg_reads = round(total_reads / total) if total else 0
        engagement = round(
            (total_likes + total_shares + total_comments + total_favorites) / total_reads * 100, 2
        ) if total_reads > 0 else 0
        return {
            "posts": total, "reads": total_reads, "likes": total_likes,
            "shares": total_shares, "favorites": total_favorites, "comments": total_comments,
            "avg_reads": avg_reads, "engagement": engagement,
        }

    def _fmt(n: int) -> str:
        """数字格式化，千位加逗号。"""
        return f"{n:,}"

    def _pct_str(v: float) -> str:
        """百分比字符串，带方向箭头。"""
        prefix = "+" if v > 0 else ""
        return f"{prefix}{v:.1f}% {'↑' if v > 0 else '↓' if v < 0 else '→'}"

    # ── 确定时间范围 ────────────────────────────────────
    main_start: date | None = None
    prev_start: date | None = None
    main_end: date = today + timedelta(days=1)  # 包含今天
    main_days = days if days > 0 else 9999

    if days > 0:
        main_start = today - timedelta(days=days)
        prev_start = main_start - timedelta(days=days)

    # ── 本期数据 ────────────────────────────────────────
    main_items = _filter_in_range(main_start, main_end)
    if not main_items:
        return "所选时间范围内暂无数据。"

    main_agg = _aggregate(main_items)
    range_label = f"近 {days} 天" if days > 0 else "全部时间"

    lines = []
    lines.append(f"统计周期：{range_label}")
    lines.append(f"文章总数：{main_agg['posts']} 篇")
    lines.append(f"总阅读量：{_fmt(main_agg['reads'])}")
    lines.append(f"总点赞数：{_fmt(main_agg['likes'])}")
    lines.append(f"总评论数：{_fmt(main_agg['comments'])}")
    lines.append(f"总转发数：{_fmt(main_agg['shares'])}")
    lines.append(f"总收藏数：{_fmt(main_agg['favorites'])}")
    lines.append(f"平均阅读/篇：{_fmt(main_agg['avg_reads'])}")
    lines.append(f"整体互动率：{main_agg['engagement']}%")
    lines.append(f"日均发布：{main_agg['posts'] / max(days, 1 if main_agg['posts'] else 1):.1f} 篇")
    lines.append("")

    # ── 上一周期对比 ────────────────────────────────────
    prev_items: dict = {}
    if prev_start and days > 0:
        prev_items = _filter_in_range(prev_start, main_start)
        if prev_items:
            prev_agg = _aggregate(prev_items)
            delta_avg = ((main_agg['avg_reads'] - prev_agg['avg_reads']) / max(prev_agg['avg_reads'], 1)) * 100
            delta_posts = ((main_agg['posts'] - prev_agg['posts']) / max(prev_agg['posts'], 1)) * 100
            delta_reads = ((main_agg['reads'] - prev_agg['reads']) / max(prev_agg['reads'], 1)) * 100
            lines.append(f"=== 与上期对比（此前{main_days}天）===")
            lines.append(f"上期文章：{prev_agg['posts']} 篇（{_pct_str(delta_posts)}）")
            lines.append(f"上期总阅读：{_fmt(prev_agg['reads'])}（{_pct_str(delta_reads)}）")
            lines.append(f"上期平均阅读：{_fmt(prev_agg['avg_reads'])}（{_pct_str(delta_avg)}）")
            lines.append(f"上期互动率：{prev_agg['engagement']}%（当前 {main_agg['engagement']}%）")
            lines.append("")

    # ── 周期内分段的补充对比（7天/14天/30天互相嵌套） ──
    # 如果周期 > 14，额外对比最近 7 天 vs 再之前 7 天
    # 如果周期 > 30，额外对比最近 14 天 vs 再之前 14 天
    if days > 14:
        last7 = _filter_in_range(today - timedelta(days=6), main_end)
        prev7 = _filter_in_range(today - timedelta(days=13), today - timedelta(days=6))
        if last7 and prev7:
            a7 = _aggregate(last7)
            b7 = _aggregate(prev7)
            d7 = ((a7['avg_reads'] - b7['avg_reads']) / max(b7['avg_reads'], 1)) * 100
            lines.append(f"近 7 天 vs 前 7 天：平均阅读 {_fmt(a7['avg_reads'])} vs {_fmt(b7['avg_reads'])}（{_pct_str(d7)}）")
            lines.append(f"  近 7 天日均 {a7['posts']/7:.1f} 篇 | 前 7 天日均 {b7['posts']/7:.1f} 篇")
            lines.append("")

    if days > 28:
        last14 = _filter_in_range(today - timedelta(days=13), main_end)
        prev14 = _filter_in_range(today - timedelta(days=27), today - timedelta(days=13))
        if last14 and prev14:
            a14 = _aggregate(last14)
            b14 = _aggregate(prev14)
            d14 = ((a14['avg_reads'] - b14['avg_reads']) / max(b14['avg_reads'], 1)) * 100
            lines.append(f"近 14 天 vs 前 14 天：平均阅读 {_fmt(a14['avg_reads'])} vs {_fmt(b14['avg_reads'])}（{_pct_str(d14)}）")
            lines.append("")

    # ── 逐日趋势（只显示最近 14 天，或整个周期 < 14 天） ──
    from datetime import timedelta as td
    daily_window = min(days, 14) if days > 0 else 14
    trend_start = today - td(days=daily_window - 1)
    daily_raw: dict[str, list] = defaultdict(list)
    for item in effects.values():
        dt = _parse_publish_time(item.get("publish_time"))
        if not dt:
            continue
        d = dt.date()
        if d < trend_start:
            continue
        daily_raw[d.isoformat()].append(item)

    if daily_raw:
        lines.append("=== 逐日数据（最近 {} 天）===".format(daily_window))
        lines.append(f"{'日期':<12} {'篇数':>4} {'阅读':>7} {'点赞':>5} {'分享':>5} {'互动率':>8} {'环比阅读变化':<14}")
        lines.append("-" * 60)
        sorted_dates = sorted(daily_raw.keys())
        prev_reads = None
        for d_str in sorted_dates:
            items = daily_raw[d_str]
            reads = sum(v.get("reads", 0) or 0 for v in items)
            likes = sum(v.get("likes", 0) or 0 for v in items)
            shares = sum(v.get("shares", 0) or 0 for v in items)
            comments = sum((v.get("comment_num") or v.get("comments") or 0) for v in items)
            posts = len(items)
            engage = round((likes + shares + comments) / reads * 100, 1) if reads > 0 else 0
            if prev_reads is not None and prev_reads > 0:
                chg = ((reads - prev_reads) / prev_reads) * 100
                chg_str = f"{chg:+.1f}% {'↑' if chg > 0 else '↓'}"
            else:
                chg_str = "-"
            lines.append(f"{d_str:<12} {posts:>4} {reads:>7} {likes:>5} {shares:>5} {engage:>7.1f}% {chg_str:<14}")
            prev_reads = reads
        lines.append("")

    # ── 艺人效率分析（含上期对比） ──────────────────────
    def _celeb_stats(items: dict) -> dict[str, dict]:
        stats: dict[str, dict] = defaultdict(lambda: {"reads": [], "likes": [], "posts": 0})
        for v in items.values():
            celeb = v.get("celebrity")
            if not celeb:
                continue
            stats[celeb]["reads"].append(v.get("reads", 0) or 0)
            stats[celeb]["likes"].append(v.get("likes", 0) or 0)
            stats[celeb]["posts"] += 1
        return stats

    main_celeb = _celeb_stats(main_items)
    if prev_start and days > 0:
        prev_celeb = _celeb_stats(prev_items)
    else:
        prev_celeb = {}

    if main_celeb:
        lines.append("=== 艺人效率排行 ===")
        lines.append(f"{'排名':>4} {'艺人':<8} {'篇数':>4} {'总阅读':>7} {'平均阅读':>8} {'最高':>6} {'上期平均':>8} {'变化':<10}")
        lines.append("-" * 65)
        ranked = sorted(
            main_celeb.items(),
            key=lambda x: sum(x[1]["reads"]) / max(len(x[1]["reads"]), 1),
            reverse=True,
        )[:15]
        for i, (name, stats) in enumerate(ranked, 1):
            avg_r = round(sum(stats["reads"]) / len(stats["reads"])) if stats["reads"] else 0
            max_r = max(stats["reads"]) if stats["reads"] else 0
            prev_avg = round(sum(prev_celeb.get(name, {}).get("reads", [])) / max(len(prev_celeb.get(name, {}).get("reads", [])), 1)) if prev_celeb else None
            if prev_avg and prev_avg > 0:
                ce_delta = ((avg_r - prev_avg) / prev_avg) * 100
                ce_str = _pct_str(ce_delta)
            elif prev_avg is not None:
                ce_str = "新艺人 ↑"
            else:
                ce_str = "-"
            lines.append(f"{i:>4} {name:<8} {stats['posts']:>4} {_fmt(sum(stats['reads'])):>7} {_fmt(avg_r):>8} {_fmt(max_r):>6} {_fmt(prev_avg) if prev_avg else 'N/A':>8} {ce_str:<10}")
        lines.append("")

    # ── 异常检测：环比下降最大的几天 ────────────────────
    if len(sorted_dates) >= 3:
        drops = []
        for i in range(1, len(sorted_dates)):
            prev_d = sorted_dates[i - 1]
            cur_d = sorted_dates[i]
            prev_r = sum(v.get("reads", 0) or 0 for v in daily_raw[prev_d])
            cur_r = sum(v.get("reads", 0) or 0 for v in daily_raw[cur_d])
            if prev_r > 0 and cur_r < prev_r * 0.5:  # 下降超过 50%
                drops.append((cur_d, prev_d, prev_r, cur_r, (cur_r - prev_r) / prev_r * 100))

        if drops:
            lines.append("=== 异常波动检测（阅读量单日下降超 50%） ===")
            for cur_d, prev_d, prev_r, cur_r, pct in drops[:5]:
                lines.append(f"  {cur_d}：{_fmt(cur_r)}（较 {prev_d} 的 {_fmt(prev_r)} 下降 {abs(pct):.0f}%）")
            lines.append("")

    # ── 最佳发布时段 ────────────────────────────────────
    hour_reads: dict[int, int] = defaultdict(int)
    dow_reads: dict[int, int] = defaultdict(int)
    for item in main_items.values():
        dt = _parse_publish_time(item.get("publish_time"))
        if dt:
            hour_reads[dt.hour] += item.get("reads", 0) or 0
            dow_reads[dt.weekday()] += item.get("reads", 0) or 0

    dow_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

    lines.append("=== 最佳发布时段 ===")
    lines.append("小时维度（Top 5）：")
    for h, r in sorted(hour_reads.items(), key=lambda x: x[1], reverse=True)[:5]:
        lines.append(f"  {h:02d}:00 — {_fmt(r)} 阅读")
    lines.append("星期维度：")
    for d, r in sorted(dow_reads.items(), key=lambda x: x[1], reverse=True):
        lines.append(f"  {dow_names[d]} — {_fmt(r)} 阅读")
    lines.append("")

    # ── 图片数量分析 ────────────────────────────────────
    img_groups: dict[int, list[int]] = defaultdict(list)
    for item in main_items.values():
        ic = item.get("image_count") or 0
        reads = item.get("reads", 0) or 0
        if reads > 0:
            img_groups[ic].append(reads)
    if img_groups:
        lines.append("=== 图片数量 vs 阅读量 ===")
        for ic in sorted(img_groups):
            vals = img_groups[ic]
            avg = round(sum(vals) / len(vals)) if vals else 0
            lines.append(f"  {ic} 张图：{len(vals)} 篇，平均阅读 {_fmt(avg)}")
        lines.append("")

    # ── 爆款文章 Top5 ──────────────────────────────────
    top5 = sorted(main_items.values(), key=lambda x: x.get("reads", 0) or 0, reverse=True)[:5]
    if top5:
        lines.append("=== 爆款文章 Top5 ===")
        for item in top5:
            title = item.get("title", "无标题")[:45]
            reads = item.get("reads", 0) or 0
            likes = item.get("likes", 0) or 0
            celeb = item.get("celebrity", "")
            lines.append(f"  - 《{title}》（{celeb}）阅读 {_fmt(reads)}，点赞 {likes}")
        lines.append("")

    # ── 低质文章 Top5（阅读最低且刚发布的） ────────────
    low5 = sorted(main_items.values(), key=lambda x: x.get("reads", 0) or 0)[:5]
    if low5 and any((v.get("reads", 0) or 0) < 100 for v in low5):
        lines.append("=== 低质文章（阅读 < 100） ===")
        for item in low5:
            title = item.get("title", "无标题")[:40]
            reads = item.get("reads", 0) or 0
            celeb = item.get("celebrity", "")
            lines.append(f"  - 《{title}》（{celeb}）阅读 {reads}")
        lines.append("")

    return "\n".join(lines)


@router.get("/api/effects/ai-analysis")
async def ai_analysis(days: int = Query(0)):
    """AI 智能分析：流式返回公众号运营建议（SSE）。"""
    data_summary = _build_data_summary(days)
    prompt = EFFECTS_ANALYSIS_TEMPLATE.format(data_summary=data_summary)

    def task_fn(msg_queue):
        try:
            for chunk in _call_ai_stream(prompt, raise_on_fail=True):
                msg_queue.put(("token", chunk))
            msg_queue.put(("done",))
        except Exception as e:
            msg_queue.put(("error", str(e)))

    return create_sse_response(task_fn)


@router.get("/api/effects/export")
async def export_effects(format: str = Query("csv")):
    """导出效果数据为 CSV。"""
    effects = app_state.get_publish_effects()
    fields = [
        "item_id", "title", "account_id", "publish_time",
        "reads", "likes", "shares", "favorites",
        "comments", "content_type",
        "source_platform", "celebrity", "image_count", "updated_at",
    ]
    headers = [
        "文章ID", "标题", "账号ID", "发布时间",
        "阅读量", "点赞数", "转发数", "收藏数",
        "评论数", "内容类型",
        "来源平台", "艺人", "图片数", "更新时间",
    ]

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(headers)
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        for item in effects.values():
            writer.writerow([item.get(f, "") for f in fields])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    return StreamingResponse(
        generate(),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": "attachment; filename=effects_export.csv"},
    )


# ── 基础 CRUD（必须在聚合端点之后，避免 {item_id} 吞掉 summary/trend 等路径）────


@router.get("/api/effects/mp-articles")
async def mp_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    celebrity: str = Query(""),
    sort_key: str = Query("publish_time"),
    sort_dir: str = Query("desc"),
):
    """返回所有发布效果数据，支持分页、筛选、排序。"""
    effects = app_state.get_publish_effects()
    articles = [
        {**v, "item_id": k}
        for k, v in effects.items()
    ]

    # 筛选
    if search:
        q = search.lower()
        articles = [a for a in articles if q in (a.get("title") or "").lower()]
    if celebrity:
        articles = [a for a in articles if a.get("celebrity") == celebrity]

    # 排序
    reverse = sort_dir != "asc"
    if sort_key == "publish_time":
        articles.sort(key=lambda x: x.get("publish_time", ""), reverse=reverse)
    else:
        articles.sort(key=lambda x: x.get(sort_key, 0) or 0, reverse=reverse)

    total = len(articles)
    start = (page - 1) * page_size
    paged = articles[start:start + page_size]

    # 艺人列表（去重）
    celeb_set = {a.get("celebrity") for a in effects.values() if a.get("celebrity") and a.get("source_platform") == "wechat_mp"}

    return {
        "articles": paged,
        "total": total,
        "page": page,
        "page_size": page_size,
        "celebrities": sorted(celeb_set),
    }


@router.delete("/api/effects/mp-articles")
async def clear_mp_articles():
    """清除所有发布效果数据。"""
    effects = app_state._ensure_publish_effects()
    deleted = len(effects)
    effects.clear()
    app_state._save_publish_effects()
    return {"success": True, "deleted": deleted}


@router.get("/api/effects")
async def list_effects():
    effects = app_state.get_publish_effects()
    return {"effects": effects}


@router.get("/api/effects/{item_id}")
async def get_effect(item_id: str):
    effect = app_state.get_publish_effects(item_id)
    return {"effect": effect or {}}


@router.post("/api/effects/{item_id}")
async def save_effect(item_id: str, req: dict):
    app_state.update_publish_effect(item_id, req)
    return {"success": True, "effect": app_state.get_publish_effects(item_id)}
