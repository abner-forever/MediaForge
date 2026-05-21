"""desktop/api.py FastAPI 集成测试。

测试策略：使用 TestClient 发送真实 HTTP 请求，mock 外部依赖（respx）。
每个测试独立使用 mock_settings + temp_data_dir fixture 隔离环境。
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from desktop.api import app
from desktop.api import _friendly_error_message


@pytest.fixture
def client(temp_data_dir: Path) -> TestClient:
    """提供 FastAPI TestClient，每次测试独立。"""
    return TestClient(app)


class TestSettingsAPI:
    def test_get_settings(self, client: TestClient, mock_settings):
        resp = client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "ai_provider" in data
        assert "download_dir" in data

    def test_get_theme(self, client: TestClient, mock_settings):
        resp = client.get("/api/settings/theme")
        assert resp.status_code == 200
        data = resp.json()
        assert "theme" in data
        assert "accent" in data

    def test_save_settings(self, client: TestClient, mock_settings):
        resp = client.post("/api/settings", json={"TEST_SETTING": "test_value"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_get_platforms(self, client: TestClient, mock_settings):
        resp = client.get("/api/platforms")
        assert resp.status_code == 200
        data = resp.json()
        assert "platforms" in data
        assert "weibo" in data["platforms"]
        assert "toutiao" in data["platforms"]


class TestDashboardAPI:
    def test_health_check(self, client: TestClient, mock_settings):
        resp = client.get("/api/dashboard/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "platform" in data
        assert "ai_api_key" in data

    def test_stats(self, client: TestClient, mock_settings):
        resp = client.get("/api/dashboard/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "local_images" in data
        assert "queue_size" in data

    def test_operations(self, client: TestClient, mock_settings):
        resp = client.get("/api/dashboard/operations")
        assert resp.status_code == 200


class TestSelectionAPI:
    def test_selection_empty(self, client: TestClient, mock_settings):
        resp = client.get("/api/selection")
        assert resp.status_code == 200
        assert resp.json()["selected"] == []

    def test_add_and_remove_selection(self, client: TestClient, mock_settings):
        client.post("/api/selection/add", json={"path": "img1.jpg"})
        resp = client.get("/api/selection")
        assert "img1.jpg" in resp.json()["selected"]

        client.post("/api/selection/remove", json={"path": "img1.jpg"})
        resp = client.get("/api/selection")
        assert resp.json()["selected"] == []


class TestQueueAPI:
    def test_empty_queue(self, client: TestClient, mock_settings):
        resp = client.get("/api/queue")
        assert resp.status_code == 200
        assert resp.json()["queue"] == []

    def test_add_to_queue(self, client: TestClient, mock_settings):
        resp = client.post("/api/queue", json={
            "title": "测试文章",
            "desc": "测试描述",
            "images": ["img1.jpg", "img2.jpg"],
        })
        assert resp.status_code == 200
        queue = resp.json()["queue"]
        assert len(queue) == 1
        assert queue[0]["title"] == "测试文章"

    def test_remove_from_queue(self, client: TestClient, mock_settings):
        client.post("/api/queue", json={"title": "待删除", "images": ["img.jpg"]})
        resp = client.delete("/api/queue/0")
        assert resp.status_code == 200

    def test_remove_invalid_index(self, client: TestClient, mock_settings):
        resp = client.delete("/api/queue/999")
        assert resp.status_code == 404

    def test_generate_content_no_key(self, client: TestClient, mock_settings):
        """无 API Key 时应返回错误信息。"""
        import os
        os.environ["AI_API_KEY"] = ""
        import config as config_module
        config_module.reload_settings()

        client.post("/api/queue", json={"title": "test", "images": ["img.jpg"]})
        resp = client.post("/api/queue/0/generate")
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    def test_update_queue_account_and_status(self, client: TestClient, mock_settings):
        client.post("/api/queue", json={"title": "test", "images": ["img.jpg"]})
        resp = client.put("/api/queue/0", json={"account_id": "acc_1", "status": "reviewing"})
        assert resp.status_code == 200
        item = resp.json()["queue"][0]
        assert item["account_id"] == "acc_1"
        assert item["status"] == "reviewing"


class TestPhaseTwoErrors:
    def test_friendly_ai_base_url_error(self):
        assert _friendly_error_message("AI_BASE_URL missing") == "当前 AI 服务需要配置 Base URL，请到设置页补全后重试。"

    def test_friendly_wechat_login_error(self):
        assert "公众号账号未登录" in _friendly_error_message("mp.weixin login timeout")


class TestMaterialsAPI:
    def test_empty_materials(self, client: TestClient, mock_settings, temp_data_dir: Path):
        """空素材目录返回空列表。"""
        resp = client.get("/api/materials")
        assert resp.status_code == 200
        data = resp.json()
        assert data["groups"] == []
        assert data["total_images"] == 0

    def test_materials_tree_empty(self, client: TestClient, mock_settings):
        resp = client.get("/api/materials/tree")
        assert resp.status_code == 200
        assert resp.json()["tree"] == []

    def test_browse_root(self, client: TestClient, mock_settings):
        resp = client.get("/api/materials/browse")
        assert resp.status_code == 200
        data = resp.json()
        assert data["folders"] == []
        assert data["files"] == []


class TestImageService:
    def test_image_not_found(self, client: TestClient, mock_settings):
        resp = client.get("/images/nonexistent.jpg")
        assert resp.status_code == 404

    def test_serve_image_found(self, client: TestClient, mock_settings, temp_data_dir: Path):
        from config import DOWNLOAD_DIR
        img_dir = DOWNLOAD_DIR / "test" / "scene" / "post"
        img_dir.mkdir(parents=True, exist_ok=True)
        img_path = img_dir / "test.jpg"
        img_path.write_bytes(b"fake_image_bytes")

        # 相对路径：test/scene/post/test.jpg
        resp = client.get("/images/test/scene/post/test.jpg")
        assert resp.status_code == 200
        assert resp.content == b"fake_image_bytes"
