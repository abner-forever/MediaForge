#!/usr/bin/env python3
"""生成视频任务中心的 MP4 教学视频（HTML 幻灯片 → Playwright 截图 → ffmpeg 合成）

使用方法:
  python3 scripts/generate_video_slides.py [--all] [--vid N]

依赖:
  pip install Pillow  (已安装)
  brew install ffmpeg (已安装: 6.0)
  pip install playwright (已安装: 1.59.0)
  playwright install chromium (如未安装)
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── 路径 ──
REPO_ROOT = Path(__file__).resolve().parent.parent
VIDEOS_DIR = REPO_ROOT / "data" / "videos"
VIDEO_TASKS_FILE = REPO_ROOT / "data" / "state" / "video_tasks.json"
OUTPUT_HTML_DIR = REPO_ROOT / "desktop" / "web" / "public" / "video-slides"

# ── 字体 ──
FONT_BOLD_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
FONT_LIGHT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

# ── 视频配置 ──
WIDTH, HEIGHT = 1280, 720  # 高清输出
FPS = 30
SLIDE_DURATION = 6.0  # 每页停留秒数
FADE_DURATION = 0.6  # 交叉淡入淡出秒数

# ── 颜色方案 ──
COLORS = {
    "bg_start": "#0f0c29",
    "bg_mid": "#302b63",
    "bg_end": "#24243e",
    "accent": "#6366f1",   # indigo-500
    "accent_light": "#818cf8",  # indigo-400
    "accent_warm": "#f59e0b",  # amber-500
    "text_white": "#ffffff",
    "text_soft": "#e2e8f0",
    "text_muted": "#94a3b8",
    "card_bg": "rgba(255,255,255,0.06)",
}


# ═══════════════════════════════════════════════
#  幻灯片内容定义
# ═══════════════════════════════════════════════

SLIDES_CONTENT = {
    "vid_001": {
        "title": "自媒体运营技巧",
        "description": "学习如何提升你的自媒体内容质量",
        "duration": 45,
        "slides": [
            {
                "type": "title",
                "title": "自媒体运营技巧",
                "subtitle": "提升内容质量，打造个人品牌",
                "emoji": "🚀",
            },
            {
                "type": "content",
                "title": "明确账号定位",
                "items": [
                    "🎯 确定目标受众 — 谁在看你的内容",
                    "📌 找到垂直领域 — 专注才有深度",
                    "💡 打造个人IP — 让粉丝记住你",
                    "📊 分析竞品账号 — 取长补短",
                ],
            },
            {
                "type": "content",
                "title": "内容创作策略",
                "items": [
                    "✍️ 保持高频更新 — 每周至少 3-5 篇",
                    "🎨 图文并茂 — 提升阅读体验",
                    "📈 数据驱动选题 — 用数据说话",
                    "🔁 系列化内容 — 提升粉丝粘性",
                ],
            },
            {
                "type": "content",
                "title": "发布与推广",
                "items": [
                    "⏰ 把握黄金发布时间",
                    "📱 多平台同步分发",
                    "🤝 社群互动运营",
                    "💰 合理利用付费推广",
                ],
            },
            {
                "type": "content",
                "title": "数据分析优化",
                "items": [
                    "📊 关注阅读量、点赞、评论、转发",
                    "🔍 分析用户画像与兴趣偏好",
                    "🔄 A/B 测试标题和封面",
                    "📝 定期复盘总结方法论",
                ],
            },
            {
                "type": "summary",
                "title": "总结",
                "items": [
                    "✅ 明确定位 + 优质内容",
                    "✅ 持续输出 + 数据驱动",
                    "✅ 善用工具 — MediaForge 助你一臂之力",
                ],
                "emoji": "🌟",
            },
        ],
    },

    "vid_002": {
        "title": "AI 智能写作",
        "description": "用 AI 提升写作效率，轻松写出好文章",
        "duration": 40,
        "slides": [
            {
                "type": "title",
                "title": "AI 智能写作",
                "subtitle": "用 AI 提升写作效率，轻松写出好文章",
                "emoji": "🤖",
            },
            {
                "type": "content",
                "title": "AI 如何辅助写作",
                "items": [
                    "🧠 智能选题推荐 — 告别选题困难",
                    "📝 一键生成文章框架",
                    "✏️ 内容扩写与润色",
                    "🌐 多语言翻译适配",
                ],
            },
            {
                "type": "content",
                "title": "MediaForge AI 功能",
                "items": [
                    "⚡ 支持多供应商：Mimo / DeepSeek / GLM",
                    "🔌 也支持 OpenAI / Qwen / MiniMax",
                    "🎯根据平台风格自动调整文风",
                    "🔄 支持续写、改写、总结等多模式",
                ],
            },
            {
                "type": "content",
                "title": "写作工作流",
                "items": [
                    "📋 发现热点 → AI 评分筛选",
                    "📸 图片下载 → 水印检测过滤",
                    "📝 AI 生成文章 → 人工微调",
                    "📱 一键发布到公众号",
                ],
            },
            {
                "type": "content",
                "title": "实用技巧",
                "items": [
                    "💡 提供详细的写作指令获得更好效果",
                    "📚 建立自己的素材库供 AI 学习",
                    "🎨 搭配封面选取功能提升点击率",
                    "✅ 发布前用 AI 做合规检测",
                ],
            },
            {
                "type": "summary",
                "title": "总结",
                "items": [
                    "✅ AI 不是替代你，而是放大你的能力",
                    "✅ 用 MediaForge 让写作效率翻倍",
                    "✅ 多尝试不同供应商找到最佳效果",
                ],
                "emoji": "✨",
            },
        ],
    },

    "vid_003": {
        "title": "封面设计技巧",
        "description": "如何选择最佳封面，提升点击率",
        "duration": 35,
        "slides": [
            {
                "type": "title",
                "title": "封面设计技巧",
                "subtitle": "如何选择最佳封面，提升点击率",
                "emoji": "🎨",
            },
            {
                "type": "content",
                "title": "封面重要性",
                "items": [
                    "👁️ 封面是第一印象 — 决定用户是否点击",
                    "📊 好封面可提升 40% 以上点击率",
                    "🎯 封面 = 内容的浓缩广告",
                    "📱 在信息流中脱颖而出",
                ],
            },
            {
                "type": "content",
                "title": "设计原则",
                "items": [
                    "🎯 主题明确 — 一眼看懂内容",
                    "🎨 色彩搭配协调 — 不超过 3 种主色",
                    "📝 文字简洁有力 — 控制在 10 字以内",
                    "🖼️ 图片高清有质感",
                ],
            },
            {
                "type": "content",
                "title": "MediaForge 封面工具",
                "items": [
                    "🖼️ AI 自动选取最佳封面帧",
                    "⭐ 图片评分功能筛选高质量图片",
                    "✂️ 智能裁剪适配各平台尺寸",
                    "💾 素材管理统一存储",
                ],
            },
            {
                "type": "content",
                "title": "进阶技巧",
                "items": [
                    "🔄 A/B 测试不同封面效果",
                    "📰 参考行业标杆账号的封面风格",
                    "🏷️ 建立统一的封面模板系列",
                    "📈 定期分析封面数据优化策略",
                ],
            },
            {
                "type": "summary",
                "title": "总结",
                "items": [
                    "✅ 好封面 = 好内容的通行证",
                    "✅ 遵循设计原则 + 善用工具",
                    "✅ MediaForge 让封面选取更智能",
                ],
                "emoji": "🎯",
            },
        ],
    },

    "vid_004": {
        "title": "公众号排版技巧",
        "description": "掌握排版技巧，提升读者阅读体验",
        "duration": 40,
        "slides": [
            {
                "type": "title",
                "title": "公众号排版技巧",
                "subtitle": "掌握排版技巧，提升读者阅读体验",
                "emoji": "📱",
            },
            {
                "type": "content",
                "title": "排版的重要性",
                "items": [
                    "📖 好的排版提高阅读完成率",
                    "👀 降低读者视觉疲劳",
                    "💼 体现专业度和品牌形象",
                    "📊 提高转发和收藏率",
                ],
            },
            {
                "type": "content",
                "title": "排版基本原则",
                "items": [
                    "📏 正文 14-16px，行高 1.6-1.8",
                    "🎯 标题层级分明（H1/H2/H3）",
                    "📝 段落简洁 — 每段不超过 5 行",
                    "🎨 配色统一 — 主色不超过 2 种",
                ],
            },
            {
                "type": "content",
                "title": "图文搭配",
                "items": [
                    "🖼️ 每 300-500 字配一张图",
                    "📐 图片风格保持一致",
                    "💬 图片添加标注说明",
                    "↔️ 合理使用分割线和引用样式",
                ],
            },
            {
                "type": "content",
                "title": "MediaForge 排版功能",
                "items": [
                    "📝 富文本编辑器 — 所见即所得",
                    "🎨 预设样式模板一键应用",
                    "📱 多设备预览效果",
                    "⚡ 一键发布到公众号",
                ],
            },
            {
                "type": "summary",
                "title": "总结",
                "items": [
                    "✅ 排版是内容的加分项",
                    "✅ 保持简洁、统一、有呼吸感",
                    "✅ MediaForge 让排版更轻松",
                ],
                "emoji": "✨",
            },
        ],
    },

    "vid_005": {
        "title": "热点内容创作",
        "description": "抓住流量密码，打造爆款内容",
        "duration": 35,
        "slides": [
            {
                "type": "title",
                "title": "热点内容创作",
                "subtitle": "抓住流量密码，打造爆款内容",
                "emoji": "🔥",
            },
            {
                "type": "content",
                "title": "为什么要追热点",
                "items": [
                    "📈 热点自带流量 — 降低传播成本",
                    "🎯 用户关注度高 — 提升曝光机会",
                    "⏰ 时效性内容更容易被推荐",
                    "💰 爆款内容带来可观的收益",
                ],
            },
            {
                "type": "content",
                "title": "如何发现热点",
                "items": [
                    "🔍 微博热搜 / 头条热榜 / 百度指数",
                    "📊 各平台 trending 话题监控",
                    "🤖 用 AI 辅助分析趋势走向",
                    "📡 MediaForge 自动发现图文素材",
                ],
            },
            {
                "type": "content",
                "title": "切入点选择",
                "items": [
                    "🎯 找与账号定位相关的角度",
                    "💡 提供独特的观点和深度分析",
                    "🔗 结合自身经验增加可信度",
                    "📝 标题要抓人但不要标题党",
                ],
            },
            {
                "type": "content",
                "title": "快速响应工作流",
                "items": [
                    "⚡ 发现热点 → 立即评估",
                    "📸 下载相关图片素材",
                    "🤖 AI 辅助快速成稿",
                    "📱 审核后立即发布",
                ],
            },
            {
                "type": "summary",
                "title": "总结",
                "items": [
                    "✅ 热点是流量放大器，但不是唯一",
                    "✅ 保持自己的风格和观点",
                    "✅ MediaForge 帮你抓住每个热点",
                ],
                "emoji": "🚀",
            },
        ],
    },
}


# ═══════════════════════════════════════════════
#  幻灯片渲染
# ═══════════════════════════════════════════════

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def make_gradient(draw, w, h, colors):
    """垂直渐变"""
    n = len(colors)
    rgb_list = [hex_to_rgb(c) for c in colors]
    for y in range(h):
        t = y / h * (n - 1)
        i = int(t)
        frac = t - i
        if i >= n - 1:
            r, g, b = rgb_list[-1]
        else:
            r = int(rgb_list[i][0] * (1 - frac) + rgb_list[i + 1][0] * frac)
            g = int(rgb_list[i][1] * (1 - frac) + rgb_list[i + 1][1] * frac)
            b = int(rgb_list[i][2] * (1 - frac) + rgb_list[i + 1][2] * frac)
        draw.line([(0, y), (w, y)], fill=(r, g, b))


def load_font(name, size):
    try:
        return ImageFont.truetype(name, size)
    except Exception:
        return ImageFont.load_default()


def render_slide(slide, video_title):
    """渲染单页幻灯片为 PIL Image"""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    base = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_base = ImageDraw.Draw(base)

    # ── 背景渐变 ──
    make_gradient(
        draw_base, WIDTH, HEIGHT,
        [COLORS["bg_start"], COLORS["bg_mid"], COLORS["bg_end"]],
    )

    # ── 装饰性圆点或光晕 ──
    accent_rgb = hex_to_rgb(COLORS["accent"])
    # 右上角大光晕
    for r in range(300, 100, -20):
        alpha = max(0, int(15 - (300 - r) / 20 * 0.5))
        draw_base.ellipse(
            (WIDTH - r, -r // 2, WIDTH + r // 2, r // 2),
            fill=(*accent_rgb, alpha),
        )
    # 左下角小光晕
    for r in range(200, 50, -20):
        alpha = max(0, int(10 - (200 - r) / 20 * 0.3))
        draw_base.ellipse(
            (-r // 2, HEIGHT - r, r // 2, HEIGHT),
            fill=(*hex_to_rgb(COLORS["accent_light"]), alpha),
        )

    # ── 绘制内容 ──
    draw = ImageDraw.Draw(img)
    s_type = slide.get("type", "content")

    if s_type == "title":
        # 标题页
        emoji = slide.get("emoji", "")
        # 主标题
        title_font = load_font(FONT_BOLD_PATH, 56)
        draw.text(
            (WIDTH // 2, HEIGHT // 2 - 60),
            f"{emoji}  {slide['title']}",
            fill=COLORS["text_white"],
            font=title_font,
            anchor="mm",
        )
        # 副标题
        sub_font = load_font(FONT_LIGHT_PATH, 24)
        subtitle = slide.get("subtitle", "")
        if subtitle:
            draw.text(
                (WIDTH // 2, HEIGHT // 2 + 20),
                subtitle,
                fill=COLORS["text_soft"],
                font=sub_font,
                anchor="mm",
            )
        # 装饰线
        accent_light = hex_to_rgb(COLORS["accent_light"])
        for i, offset in enumerate([-2, 0, 2]):
            draw.rectangle(
                (WIDTH // 2 - 80, HEIGHT // 2 + 55 + offset,
                 WIDTH // 2 + 80, HEIGHT // 2 + 57 + offset),
                fill=(*accent_light, 60 + i * 30),
            )
        # 底部提示
        hint_font = load_font(FONT_LIGHT_PATH, 14)
        draw.text(
            (WIDTH // 2, HEIGHT - 40),
            video_title,
            fill=COLORS["text_muted"],
            font=hint_font,
            anchor="mm",
        )

    elif s_type == "summary":
        # 总结页
        emoji = slide.get("emoji", "✅")
        # emoji 装饰
        emoji_font = load_font(FONT_BOLD_PATH, 60)
        draw.text(
            (WIDTH // 2, HEIGHT // 2 - 80),
            emoji,
            fill=COLORS["text_white"],
            font=emoji_font,
            anchor="mm",
        )
        # 标题
        title_font = load_font(FONT_BOLD_PATH, 44)
        draw.text(
            (WIDTH // 2, HEIGHT // 2 - 20),
            slide["title"],
            fill=COLORS["text_white"],
            font=title_font,
            anchor="mm",
        )
        # 列表项
        item_font = load_font(FONT_LIGHT_PATH, 22)
        items = slide.get("items", [])
        start_y = HEIGHT // 2 + 30
        for i, item in enumerate(items):
            draw.text(
                (WIDTH // 2, start_y + i * 40),
                item,
                fill=COLORS["text_soft"],
                font=item_font,
                anchor="mm",
            )
        # 底部提示
        hint_font = load_font(FONT_LIGHT_PATH, 14)
        draw.text(
            (WIDTH // 2, HEIGHT - 40),
            video_title,
            fill=COLORS["text_muted"],
            font=hint_font,
            anchor="mm",
        )

    else:
        # 内容页
        # 标题
        title_font = load_font(FONT_BOLD_PATH, 40)
        draw.text(
            (WIDTH // 2, 110),
            slide["title"],
            fill=COLORS["text_white"],
            font=title_font,
            anchor="mm",
        )
        # 标题装饰线
        accent_rgb = hex_to_rgb(COLORS["accent"])
        for i, offset in enumerate([-1, 0, 1]):
            draw.rectangle(
                (WIDTH // 2 - 50, 140 + offset,
                 WIDTH // 2 + 50, 142 + offset),
                fill=(*accent_rgb, 80 + i * 40),
            )

        # 列表项（卡片风格）
        items = slide.get("items", [])
        card_h = 65
        card_gap = 12
        total_h = len(items) * card_h + (len(items) - 1) * card_gap
        start_y = (HEIGHT - total_h) // 2 + 10

        for i, item in enumerate(items):
            cy = start_y + i * (card_h + card_gap)
            # 卡片背景
            card_rgb = (255, 255, 255)
            draw.rounded_rectangle(
                (WIDTH // 2 - 320, cy, WIDTH // 2 + 320, cy + card_h),
                radius=10,
                fill=(*card_rgb, 35),
                outline=(*hex_to_rgb(COLORS["accent_light"]), 60),
            )
            # 左侧竖条装饰
            accent_accent = hex_to_rgb(COLORS["accent"])
            draw.rounded_rectangle(
                (WIDTH // 2 - 320, cy, WIDTH // 2 - 310, cy + card_h),
                radius=4,
                fill=(*accent_accent, 200),
            )
            # 文本 — 使用粗体和白字增强可读性
            item_font = load_font(FONT_BOLD_PATH, 24)
            draw.text(
                (WIDTH // 2 - 295, cy + card_h // 2),
                item,
                fill=COLORS["text_white"],
                font=item_font,
                anchor="lm",
            )

        # 页码/底部提示
        hint_font = load_font(FONT_LIGHT_PATH, 14)
        draw.text(
            (WIDTH // 2, HEIGHT - 30),
            video_title,
            fill=COLORS["text_muted"],
            font=hint_font,
            anchor="mm",
        )

    # 合成
    final = Image.alpha_composite(base, img)
    return final.convert("RGB")


# ═══════════════════════════════════════════════
#  视频生成（ffmpeg）
# ═══════════════════════════════════════════════

def generate_video_frames(video_id, content):
    """生成视频所有帧到临时目录"""
    temp_dir = Path(tempfile.mkdtemp(prefix=f"frames_{video_id}_"))
    frames_dir = temp_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    slides_def = content["slides"]
    target_duration = content["duration"]
    n_slides = len(slides_def)

    # 计算每页帧数
    total_frames = int(target_duration * FPS)
    transition_frames = int(FADE_DURATION * FPS)
    hold_frames_per_slide = total_frames // n_slides
    remain = total_frames - hold_frames_per_slide * n_slides

    print(f"  → 总帧数: {total_frames}, 每页: {hold_frames_per_slide} 帧, "
          f"过渡: {transition_frames} 帧")

    # 预先渲染所有幻灯片
    rendered = []
    for s in slides_def:
        img = render_slide(s, content["title"])
        rendered.append(img)
        print(f"    ✓ 渲染: {s['type']} - {s['title']}")

    # 生成帧序列
    frame_idx = 0
    for si, slide in enumerate(slides_def):
        current = rendered[si]
        next_img = rendered[(si + 1) % n_slides]

        n_hold = hold_frames_per_slide + (1 if si < remain else 0)

        for fi in range(n_hold):
            if fi < n_hold - transition_frames:
                # 纯当前页
                frame = current
            else:
                # 过渡到下一页
                t = (fi - (n_hold - transition_frames)) / transition_frames
                frame = Image.blend(current, next_img, t)

            frame_path = frames_dir / f"frame_{frame_idx:06d}.png"
            frame.save(frame_path, "PNG")
            frame_idx += 1

    # 最后一帧多保持一会儿
    for _ in range(int(FPS * 0.5)):
        rendered[-1].save(frames_dir / f"frame_{frame_idx:06d}.png", "PNG")
        frame_idx += 1

    print(f"    ✓ 生成 {frame_idx} 帧")
    return temp_dir, frames_dir


def create_video(frames_dir, output_path):
    """用 ffmpeg 从帧序列合成 MP4"""
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", str(frames_dir / "frame_%06d.png"),
        "-c:v", "libx264",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-crf", "22",
        "-vf", f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,"
               f"pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2",
        "-movflags", "+faststart",
        "-an",
        str(output_path),
    ]
    print(f"  → ffmpeg: {' '.join(cmd[:6])} ...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ ffmpeg 失败: {result.stderr}")
        return False
    print(f"  ✓ 视频生成: {output_path}")
    return True


def generate_video(video_id, content, force=False):
    """为单个视频生成全部内容"""
    output_path = VIDEOS_DIR / f"{video_id}.mp4"
    if output_path.exists() and not force:
        # 检查文件大小，如果文件太小可能有问题
        size_kb = output_path.stat().st_size / 1024
        if size_kb > 100:
            print(f"  ✓ 已存在 ({size_kb:.0f} KB)，跳过")
            return

    print(f"\n▶ 生成 {video_id}: {content['title']}")

    # 1. 渲染帧
    temp_dir, frames_dir = generate_video_frames(video_id, content)

    # 2. 合成视频
    try:
        success = create_video(frames_dir, output_path)
        if success:
            size_kb = output_path.stat().st_size / 1024
            # 更新 duration 为实际目标时长
            actual_duration = os.path.getsize(output_path)  # 非准确但接近
            print(f"  ✓ 完成: {output_path} ({size_kb:.0f} KB)")
    finally:
        # 清理临时文件
        shutil.rmtree(temp_dir, ignore_errors=True)

    # 验证生成的视频
    if output_path.exists():
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "format=duration,size", "-of", "csv=p=0",
             str(output_path)],
            capture_output=True, text=True,
        )
        if probe.stdout:
            dur_str = probe.stdout.strip().split(",")[0]
            try:
                actual_dur = float(dur_str)
                print(f"  ⏱ 时长: {actual_dur:.1f}s (目标: {content['duration']}s)")
            except ValueError:
                pass


def generate_html_slides(video_id, content):
    """生成可独立浏览的 HTML 幻灯片（用于参考和展示）"""
    OUTPUT_HTML_DIR.mkdir(parents=True, exist_ok=True)

    slides = content["slides"]
    slides_js = json.dumps(slides, ensure_ascii=False)

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{content['title']} — MediaForge</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    background: #0f0c29;
    color: #fff;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  }}
  .slide-container {{
    position: relative;
    width: 1280px;
    height: 720px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 30px 80px rgba(0,0,0,0.5);
  }}
  .slide {{
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.6s ease;
    padding: 60px;
  }}
  .slide.active {{ opacity: 1; }}
  .slide-title {{
    font-size: 48px;
    font-weight: 700;
    margin-bottom: 20px;
    text-align: center;
  }}
  .slide-subtitle {{
    font-size: 24px;
    color: #c4b5fd;
    margin-bottom: 10px;
  }}
  .slide-emoji {{ font-size: 64px; margin-bottom: 20px; }}
  .slide-items {{
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 700px;
  }}
  .slide-item {{
    background: rgba(255,255,255,0.06);
    border-left: 4px solid #6366f1;
    border-radius: 10px;
    padding: 16px 20px;
    font-size: 20px;
    color: #e2e8f0;
    line-height: 1.5;
  }}
  .slide-hint {{
    position: absolute;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    color: #64748b;
    font-size: 14px;
  }}
  .controls {{
    position: absolute;
    bottom: 20px;
    right: 30px;
    display: flex;
    gap: 12px;
  }}
  .controls button {{
    padding: 8px 16px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px;
    background: rgba(255,255,255,0.08);
    color: #c4b5fd;
    font-size: 14px;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: all 0.2s;
  }}
  .controls button:hover {{
    background: rgba(255,255,255,0.15);
    color: #fff;
  }}
  .progress-dots {{
    position: absolute;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
  }}
  .dot {{
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255,255,255,0.2);
    transition: all 0.3s;
  }}
  .dot.active {{ background: #818cf8; width: 24px; border-radius: 4px; }}
</style>
</head>
<body>
<div class="slide-container">
  <div id="slides"></div>
  <div class="progress-dots" id="dots"></div>
  <div class="controls">
    <button onclick="prevSlide()">◀ 上一页</button>
    <button onclick="nextSlide()">下一页 ▶</button>
  </div>
</div>
<script>
const slides = {slides_js};
let current = 0;

function render() {{
  const container = document.getElementById('slides');
  const dots = document.getElementById('dots');
  container.innerHTML = slides.map((s, i) => `
    <div class="slide ${{i === 0 ? 'active' : ''}}" data-index="${{i}}">
      ${{s.type === 'title' ? `
        <div class="slide-emoji">${{s.emoji || ''}}</div>
        <div class="slide-title">${{s.title}}</div>
        <div class="slide-subtitle">${{s.subtitle || ''}}</div>
      ` : s.type === 'summary' ? `
        <div class="slide-emoji">${{s.emoji || '✅'}}</div>
        <div class="slide-title">${{s.title}}</div>
        <div class="slide-items">${{(s.items || []).map(item => `<div class="slide-item">${{item}}</div>`).join('')}}</div>
      ` : `
        <div class="slide-title">${{s.title}}</div>
        <div class="slide-items" style="margin-top:20px">${{(s.items || []).map(item => `<div class="slide-item">${{item}}</div>`).join('')}}</div>
      `}}
    </div>
  `).join('');
  dots.innerHTML = slides.map((_, i) => `<div class="dot ${{i === 0 ? 'active' : ''}}"></div>`).join('');
}}

function showSlide(idx) {{
  document.querySelectorAll('.slide').forEach((el, i) => {{
    el.classList.toggle('active', i === idx);
  }});
  document.querySelectorAll('.dot').forEach((el, i) => {{
    el.classList.toggle('active', i === idx);
  }});
  current = idx;
}}

function nextSlide() {{ showSlide((current + 1) % slides.length); }}
function prevSlide() {{ showSlide((current - 1 + slides.length) % slides.length); }}

document.addEventListener('keydown', e => {{
  if (e.key === 'ArrowRight' || e.key === ' ') {{ e.preventDefault(); nextSlide(); }}
  if (e.key === 'ArrowLeft') {{ e.preventDefault(); prevSlide(); }}
}});

render();
</script>
</body>
</html>"""

    output_path = OUTPUT_HTML_DIR / f"{video_id}.html"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  ✓ HTML 幻灯片: {output_path}")
    return output_path


# ═══════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════

def update_video_tasks_json(force=False):
    """更新视频列表 JSON 中的 duration_seconds 与目标一致"""
    if not VIDEO_TASKS_FILE.exists():
        print(f"⚠ 未找到 {VIDEO_TASKS_FILE}")
        return

    data = json.loads(VIDEO_TASKS_FILE.read_text(encoding="utf-8"))
    updated = False
    for v in data.get("videos", []):
        vid = v["id"]
        if vid in SLIDES_CONTENT:
            target = SLIDES_CONTENT[vid]["duration"]
            if v.get("duration_seconds") != target:
                print(f"  ✓ 更新 {vid} duration: {v['duration_seconds']} → {target}")
                v["duration_seconds"] = target
                updated = True

    if updated:
        VIDEO_TASKS_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def main():
    import argparse

    parser = argparse.ArgumentParser(description="生成视频任务中心的 MP4 教学视频")
    parser.add_argument("--all", action="store_true", help="生成所有视频")
    parser.add_argument("--vid", type=str, help="指定视频 ID (如 vid_001)")
    parser.add_argument("--force", action="store_true", help="强制重新生成")
    parser.add_argument("--html-only", action="store_true", help="只生成 HTML 幻灯片")
    parser.add_argument("--skip-html", action="store_true", help="跳过 HTML 幻灯片生成")
    args = parser.parse_args()

    # 确保输出目录存在
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    video_ids = list(SLIDES_CONTENT.keys())
    if args.vid:
        if args.vid not in SLIDES_CONTENT:
            print(f"✗ 未知视频 ID: {args.vid}，可选: {', '.join(video_ids)}")
            sys.exit(1)
        video_ids = [args.vid]

    for vid in video_ids:
        content = SLIDES_CONTENT[vid]

        # HTML 幻灯片
        if not args.skip_html:
            generate_html_slides(vid, content)
        else:
            print(f"  - 跳过 HTML 幻灯片: {vid}")

        # MP4 视频
        if not args.html_only:
            generate_video(vid, content, force=args.force)
        else:
            print(f"  - 跳过 MP4 生成 (--html-only): {vid}")

    # 更新 JSON
    if not args.html_only:
        update_video_tasks_json(force=args.force)

    print("\n✅ 全部完成！")
    print(f"  MP4 文件: {VIDEOS_DIR}/")
    print(f"  HTML 幻灯片: {OUTPUT_HTML_DIR}/")


if __name__ == "__main__":
    main()
