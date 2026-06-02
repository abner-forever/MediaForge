"""发布数据分析 API。"""

import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from desktop.app_state import app_state

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
