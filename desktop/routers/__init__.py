"""路由模块聚合。"""

from fastapi import APIRouter

from .settings import router as settings_router
from .auth import router as auth_router
from .wechat import router as wechat_router
from .dashboard import router as dashboard_router
from .discovery import router as discovery_router
from .queue import router as queue_router
from .images import router as images_router
from .materials import router as materials_router
from .articles import router as articles_router
from .effects import router as effects_router
from .logs import router as logs_router
from .pipeline import router as pipeline_router

api_router = APIRouter()
api_router.include_router(settings_router)
api_router.include_router(auth_router)
api_router.include_router(wechat_router)
api_router.include_router(dashboard_router)
api_router.include_router(discovery_router)
api_router.include_router(queue_router)
api_router.include_router(images_router)
api_router.include_router(materials_router)
api_router.include_router(articles_router)
api_router.include_router(effects_router)
api_router.include_router(logs_router)
api_router.include_router(pipeline_router)
