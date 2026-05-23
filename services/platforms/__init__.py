"""平台注册中心 — 注册、查询、列出所有支持的平台。"""

from typing import Dict, Optional

from services.platforms.base import PlatformMeta, PlatformService

# 延迟导入避免循环依赖（各平台模块在导入时读取 settings）
_PLATFORM_REGISTRY: Dict[str, "PlatformService"] = {}

_initialized = False


def _ensure_registry() -> None:
    global _initialized
    if _initialized:
        return
    from services.platforms.weibo import WeiboService
    from services.platforms.toutiao import ToutiaoService

    _PLATFORM_REGISTRY["weibo"] = WeiboService
    _PLATFORM_REGISTRY["toutiao"] = ToutiaoService
    from services.platforms.xhs import XHSService
    _PLATFORM_REGISTRY["xhs"] = XHSService
    _initialized = True


def get_platform(platform_id: str) -> Optional["PlatformService"]:
    """根据平台 ID 获取平台服务实现。"""
    _ensure_registry()
    return _PLATFORM_REGISTRY.get(platform_id)


def list_platforms() -> Dict[str, PlatformMeta]:
    """列出所有已注册平台的元数据。"""
    _ensure_registry()
    return {pid: svc.meta for pid, svc in _PLATFORM_REGISTRY.items()}


def get_default_platform() -> str:
    """获取默认平台。"""
    from config import settings

    return settings.platform or "weibo"
