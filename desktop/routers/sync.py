"""云同步配置与管理接口。"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.cloud_sync import get_cloud_sync
from utils.logger import log

router = APIRouter(tags=["sync"])


# ==================== 请求模型 ====================

class SyncConfigRequest(BaseModel):
    """同步配置请求"""
    server_url: str
    secret: str


class SyncConfigResponse(BaseModel):
    """同步配置响应"""
    enabled: bool
    configured: bool
    server_url: str
    device_id: Optional[str]
    last_sync: Optional[str]
    auto_sync: bool
    sync_interval: int
    is_syncing: bool


# ==================== API 端点 ====================

@router.get("/api/sync/status")
async def get_sync_status():
    """
    获取云同步状态

    返回当前同步配置和状态信息
    """
    try:
        cloud_sync = get_cloud_sync()
        return cloud_sync.get_status()
    except Exception as e:
        log.error(f"获取同步状态失败: {e}")
        return {
            "enabled": False,
            "configured": False,
            "server_url": "",
            "device_id": None,
            "last_sync": None,
            "auto_sync": True,
            "sync_interval": 300,
            "is_syncing": False,
            "error": str(e)
        }


@router.post("/api/sync/configure")
async def configure_sync(request: SyncConfigRequest):
    """
    配置云同步

    设置服务器地址和密钥，启用云同步功能
    """
    try:
        cloud_sync = get_cloud_sync()

        # 先配置
        cloud_sync.configure(request.server_url, request.secret)

        # 测试连接
        success, message = cloud_sync.test_connection()

        if success:
            # 启动自动同步
            from desktop.app_state import app_state
            cloud_sync.start_auto_sync(
                lambda: app_state._credits.copy() if hasattr(app_state, '_credits') else {}
            )

            return {
                "success": True,
                "message": f"配置成功，{message}",
                "status": cloud_sync.get_status()
            }
        else:
            # 连接失败，禁用同步
            cloud_sync.disable()
            raise HTTPException(
                status_code=400,
                detail=f"服务器连接失败: {message}"
            )

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"配置同步失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"配置失败: {str(e)}"
        )


@router.post("/api/sync/disable")
async def disable_sync():
    """
    禁用云同步

    停止自动同步并清除配置
    """
    try:
        cloud_sync = get_cloud_sync()
        cloud_sync.disable()

        return {
            "success": True,
            "message": "云同步已禁用"
        }
    except Exception as e:
        log.error(f"禁用同步失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"禁用失败: {str(e)}"
        )


@router.post("/api/sync/test")
async def test_sync_connection():
    """
    测试同步连接

    验证服务器是否可达
    """
    try:
        cloud_sync = get_cloud_sync()
        success, message = cloud_sync.test_connection()

        return {
            "success": success,
            "message": message
        }
    except Exception as e:
        log.error(f"测试连接失败: {e}")
        return {
            "success": False,
            "message": f"测试失败: {str(e)}"
        }


@router.post("/api/sync/manual")
async def manual_sync():
    """
    手动触发同步

    立即将本地积分数据同步到云端
    """
    try:
        cloud_sync = get_cloud_sync()

        if not cloud_sync.is_configured():
            raise HTTPException(
                status_code=400,
                detail="未配置同步服务"
            )

        # 获取本地积分数据
        from desktop.app_state import app_state
        credits_data = app_state._credits.copy()

        # 执行同步
        success, message = cloud_sync.sync_credits(credits_data)

        if success:
            return {
                "success": True,
                "message": "同步成功",
                "last_sync": cloud_sync.config.get('last_sync')
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=f"同步失败: {message}"
            )

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"手动同步失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"同步失败: {str(e)}"
        )


@router.post("/api/sync/load")
async def load_from_cloud():
    """
    从云端加载积分数据

    用云端数据覆盖本地数据（谨慎使用）
    """
    try:
        cloud_sync = get_cloud_sync()

        if not cloud_sync.is_configured():
            raise HTTPException(
                status_code=400,
                detail="未配置同步服务"
            )

        # 从云端加载
        success, data, message = cloud_sync.load_credits()

        if success and data:
            # 更新本地数据
            from desktop.app_state import app_state
            app_state._credits = data
            app_state._save_credits()

            return {
                "success": True,
                "message": "从云端加载成功",
                "balance": data.get('balance', 0)
            }
        else:
            return {
                "success": False,
                "message": message
            }

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"从云端加载失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"加载失败: {str(e)}"
        )


@router.get("/api/sync/device-info")
async def get_device_info():
    """
    获取设备信息

    返回设备ID和硬件信息（用于调试）
    """
    try:
        from utils.device import get_device_info
        return get_device_info()
    except Exception as e:
        log.error(f"获取设备信息失败: {e}")
        return {
            "error": str(e)
        }
