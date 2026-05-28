"""发布效果分析 API。"""

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
    hour_reads: dict[int, int] = defaultdict(int)
    dow_reads: dict[int, int] = defaultdict(int)
    celeb_data: dict[str, list[int]] = defaultdict(list)

    for item in effects.values():
        reads = item.get("reads", 0) or 0
        likes = item.get("likes", 0) or 0
        total_reads += reads
        total_likes += likes
        total_comments += (item.get("comment_num") or item.get("comments") or 0)

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
        "avg_reads": round(total_reads / total_posts) if total_posts else 0,
        "avg_likes": round(total_likes / total_posts) if total_posts else 0,
        "best_publish_hour": best_hour,
        "best_day_of_week": best_dow,
        "top_celebrities": top_celebrities,
    }


@router.get("/api/effects/trend")
async def effects_trend(days: int = Query(30)):
    """趋势数据：按天聚合阅读量、点赞数、发布数。"""
    effects = app_state.get_publish_effects()
    today = datetime.now().date()
    start = today - timedelta(days=days - 1)

    # 初始化每日桶
    daily: dict[str, dict] = {}
    d = start
    while d <= today:
        daily[d.isoformat()] = {"date": d.isoformat(), "reads": 0, "likes": 0, "posts": 0}
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


@router.get("/api/effects/export")
async def export_effects(format: str = Query("csv")):
    """导出效果数据为 CSV。"""
    effects = app_state.get_publish_effects()
    fields = [
        "item_id", "title", "account_id", "publish_time",
        "reads", "likes", "shares", "favorites",
        "comments", "new_followers", "content_type",
        "source_platform", "celebrity", "image_count", "updated_at",
    ]

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(fields)
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
    """返回从公众号同步的文章列表（key 以 mp: 开头的记录），支持分页、筛选、排序。"""
    effects = app_state.get_publish_effects()
    articles = [
        {**v, "item_id": k}
        for k, v in effects.items()
        if k.startswith("mp:")
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
    """清除所有从公众号同步的文章数据（key 以 mp: 开头的记录）。"""
    deleted = app_state.delete_publish_effects_by_prefix("mp:")
    return {"success": True, "deleted": deleted}


@router.get("/api/effects")
async def list_effects():
    return {"effects": app_state.get_publish_effects()}


@router.get("/api/effects/{item_id}")
async def get_effect(item_id: str):
    effect = app_state.get_publish_effects(item_id)
    return {"effect": effect or {}}


@router.post("/api/effects/{item_id}")
async def save_effect(item_id: str, req: dict):
    app_state.update_publish_effect(item_id, req)
    return {"success": True, "effect": app_state.get_publish_effects(item_id)}
