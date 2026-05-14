"""Platform 基类／协议单元测试。"""

from __future__ import annotations

from services.platforms.base import PlatformMeta


class TestPlatformMeta:
    def test_default_auth_fields(self):
        meta = PlatformMeta(id="test", name="Test", fetch_modes={}, default_fetch_mode="", search_params_description="")
        assert meta.auth_fields == ["cookie"]

    def test_custom_values(self):
        meta = PlatformMeta(
            id="custom",
            name="Custom",
            auth_fields=["cookie", "token"],
            fetch_modes={"mode1": "方式1"},
            default_fetch_mode="mode1",
            search_params_description="自定义搜索",
        )
        assert meta.id == "custom"
        assert meta.auth_fields == ["cookie", "token"]
