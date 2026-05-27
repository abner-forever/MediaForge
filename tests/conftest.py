"""全局测试 fixtures."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

import pytest
from PIL import Image, ImageDraw

import config as config_module


@pytest.fixture
def temp_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """创建临时数据目录，替换 config 模块中的路径常量。"""
    data_dir = tmp_path / "data"
    images_dir = data_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "state").mkdir(parents=True, exist_ok=True)
    (data_dir / "logs").mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(config_module, "DATA_DIR", data_dir)
    monkeypatch.setattr(config_module, "DOWNLOAD_DIR", images_dir)
    monkeypatch.setattr(config_module, "POSTS_CACHE_PATH", data_dir / "posts.json")
    monkeypatch.setattr(config_module, "QUEUE_CACHE_PATH", data_dir / "queue.json")
    monkeypatch.setattr(config_module, "WECHAT_STATE_PATH", data_dir / "state" / "wechat.json")
    monkeypatch.setattr(config_module, "WEIBO_UID_CACHE_PATH", data_dir / "state" / "weibo_uid_map.json")
    monkeypatch.setattr(config_module, "WEIBO_TOPIC_CACHE_PATH", data_dir / "state" / "weibo_topic_map.json")
    monkeypatch.setattr(config_module, "LOG_DIR", data_dir / "logs")

    # 同步更新 desktop 模块中已导入的路径常量
    import desktop.api as desktop_api
    import desktop.app_state as app_state_module
    monkeypatch.setattr(desktop_api, "DOWNLOAD_DIR", images_dir)
    monkeypatch.setattr(app_state_module, "QUEUE_CACHE_PATH", data_dir / "queue.json")
    monkeypatch.setattr(app_state_module, "OPLOG_CACHE_PATH", data_dir / "state" / "operations.json")

    # 同步更新 utils 模块中的硬编码路径
    import utils.api_key_store as api_key_store_module
    import utils.settings_store as settings_store_module
    import utils.weibo_auth_store as weibo_auth_store_module
    monkeypatch.setattr(api_key_store_module, "KEYS_PATH", data_dir / "state" / "api_keys.json")
    monkeypatch.setattr(settings_store_module, "SETTINGS_PATH", data_dir / "state" / "settings.json")
    monkeypatch.setattr(weibo_auth_store_module, "AUTH_PATH", data_dir / "state" / "weibo_auth.json")

    # 同步更新 audit 模块中的 LOG_DIR 引用
    import utils.audit as audit_module
    monkeypatch.setattr(audit_module, "LOG_DIR", data_dir / "logs")

    return data_dir


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch: pytest.MonkeyPatch, temp_data_dir: Path) -> Generator[None, None, None]:
    """为每个测试重置 settings 为已知默认值。

    自动使用 (autouse=True)，确保所有测试都在可控的配置环境下运行。
    """
    saved = {}
    for key in (
        "WEIBO_COOKIE", "WEIBO_UID", "WEIBO_FETCH_MODE",
        "AI_PROVIDER", "AI_MODEL", "AI_API_KEY", "AI_BASE_URL",
        "WATERMARK_FILTER", "WATERMARK_CORNER_RATIO", "WATERMARK_BOTTOM_RATIO",
        "MATERIALS_PATH", "POST_LIMIT", "RETRY_TIMES",
    ):
        saved[key] = os.environ.get(key)

    monkeypatch.setenv("WATERMARK_FILTER", "true")
    monkeypatch.setenv("WATERMARK_CORNER_RATIO", "1.38")
    monkeypatch.setenv("WATERMARK_BOTTOM_RATIO", "1.48")
    monkeypatch.setenv("WATERMARK_STRICT_MODE", "true")
    monkeypatch.setenv("AI_PROVIDER", "mimo")
    monkeypatch.setenv("AI_MODEL", "mimo-v2.5-pro")
    monkeypatch.setenv("RETRY_TIMES", "2")
    monkeypatch.setenv("POST_LIMIT", "3")

    # 重建 settings 单例
    config_module.CELEBRITY_NAMES = config_module._csv_tuple(os.getenv("WEIBO_CELEBRITIES", ""))
    new_settings = config_module.Settings(weibo_celebrities=config_module.CELEBRITY_NAMES)
    for field_name in new_settings.__dataclass_fields__:
        setattr(config_module.settings, field_name, getattr(new_settings, field_name))

    # 重置桌面应用的全局 app_state 单例
    from desktop.app_state import app_state
    app_state.__init__()

    yield

    for key, val in saved.items():
        if val is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, val)


@pytest.fixture
def sample_images(tmp_path: Path) -> Path:
    """用 PIL 生成一系列测试用图片。"""
    img_dir = tmp_path / "sample_images"
    img_dir.mkdir(parents=True, exist_ok=True)

    # 纯白图片（干净）
    im = Image.new("RGB", (200, 200), "white")
    im.save(img_dir / "blank.png")

    # 带角部水印的图片 — 右下角密集棋盘格模拟角标（高边缘响应）
    im = Image.new("RGB", (400, 400), "white")
    draw = ImageDraw.Draw(im)
    for x in range(350, 400, 8):
        for y in range(350, 400, 8):
            if (x // 8 + y // 8) % 2 == 0:
                draw.rectangle((x, y, x + 7, y + 7), fill="black")
    im.save(img_dir / "corner_watermark.png")

    # 带底部横条的图片 — 底部密集水平条纹模拟水印条
    im = Image.new("RGB", (400, 400), "white")
    draw = ImageDraw.Draw(im)
    for x in range(0, 400, 4):
        for y in range(354, 400, 4):
            if (x // 4 + y // 4) % 2 == 0:
                draw.rectangle((x, y, x + 3, y + 3), fill="black")
    im.save(img_dir / "bottom_watermark.png")

    # 渐变图片（中等复杂度）
    im = Image.new("RGB", (400, 400))
    for x in range(400):
        for y in range(400):
            im.putpixel((x, y), (x % 256, y % 256, (x + y) % 256))
    im.save(img_dir / "gradient.jpg")

    # 极小图片（<120px）
    im = Image.new("RGB", (50, 50), "white")
    im.save(img_dir / "tiny.png")

    # 多帧 GIF
    frames = []
    for i in range(3):
        im = Image.new("RGB", (100, 100), (i * 50, i * 50, i * 50))
        frames.append(im)
    frames[0].save(img_dir / "multiframe.gif", save_all=True, append_images=frames[1:])

    # RGBA PNG
    im = Image.new("RGBA", (200, 200), (255, 0, 0, 128))
    im.save(img_dir / "rgba.png")

    return img_dir
