"""
积分云同步服务端

独立的 FastAPI 服务，用于存储和同步用户的积分数据。
部署到你的服务器上，桌面应用会自动连接同步。

启动方式：
    cd cloud_sync
    pip install -r requirements.txt
    python server.py

环境变量：
    SYNC_SECRET: 同步密钥（用于验证请求签名）
    SYNC_DATA_DIR: 数据存储目录（默认 ./data）
    SYNC_PORT: 服务端口（默认 8080）
"""

import os
import json
import hashlib
import hmac
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# 配置
SECRET = os.getenv("SYNC_SECRET", "mediaforge-sync-secret-2024")
DATA_DIR = Path(os.getenv("SYNC_DATA_DIR", "./data"))
PORT = int(os.getenv("SYNC_PORT", "8080"))

# 确保数据目录存在
DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="MediaForge 积分云同步服务",
    description="存储和同步用户积分数据",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== 数据模型 ====================

class CreditsData(BaseModel):
    """积分数据"""
    balance: int
    daily_checkin: dict
    transactions: list
    updated_at: str


class SyncRequest(BaseModel):
    """同步请求"""
    device_id: str
    data: CreditsData
    timestamp: int


class SyncResponse(BaseModel):
    """同步响应"""
    success: bool
    message: str
    data: Optional[CreditsData] = None


# ==================== 工具函数 ====================

def get_device_file(device_id: str) -> Path:
    """获取设备数据文件路径"""
    # 安全检查：只允许字母数字和短横线
    if not all(c.isalnum() or c == '-' for c in device_id):
        raise HTTPException(status_code=400, detail="无效的设备ID")
    return DATA_DIR / f"{device_id}.json"


def verify_signature(device_id: str, timestamp: int, signature: str) -> bool:
    """
    验证请求签名

    签名算法：HMAC-SHA256(device_id + timestamp, secret)
    """
    message = f"{device_id}{timestamp}"
    expected = hmac.new(
        SECRET.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected)


def load_device_data(device_id: str) -> Optional[dict]:
    """加载设备数据"""
    file_path = get_device_file(device_id)
    if file_path.exists():
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return None
    return None


def save_device_data(device_id: str, data: dict):
    """保存设备数据"""
    file_path = get_device_file(device_id)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ==================== API 端点 ====================

@app.get("/")
async def root():
    """健康检查"""
    return {
        "service": "MediaForge 积分云同步",
        "status": "running",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/sync/{device_id}")
async def get_credits(
    device_id: str,
    x_timestamp: str = Header(...),
    x_signature: str = Header(...)
):
    """
    获取设备积分数据

    Headers:
        X-Timestamp: 请求时间戳
        X-Signature: HMAC-SHA256 签名
    """
    # 验证签名
    try:
        timestamp = int(x_timestamp)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的时间戳")

    if not verify_signature(device_id, timestamp, x_signature):
        raise HTTPException(status_code=401, detail="签名验证失败")

    # 检查时间戳有效期（5分钟）
    if abs(time.time() - timestamp) > 300:
        raise HTTPException(status_code=401, detail="请求已过期")

    # 加载数据
    data = load_device_data(device_id)

    if data:
        return {
            "success": True,
            "data": data
        }
    else:
        return {
            "success": False,
            "message": "未找到设备数据"
        }


@app.post("/api/sync/{device_id}")
async def sync_credits(
    device_id: str,
    request: Request,
    x_timestamp: str = Header(...),
    x_signature: str = Header(...)
):
    """
    同步设备积分数据

    Headers:
        X-Timestamp: 请求时间戳
        X-Signature: HMAC-SHA256 签名

    Body:
        完整的积分数据对象
    """
    # 验证签名
    try:
        timestamp = int(x_timestamp)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的时间戳")

    if not verify_signature(device_id, timestamp, x_signature):
        raise HTTPException(status_code=401, detail="签名验证失败")

    # 检查时间戳有效期（5分钟）
    if abs(time.time() - timestamp) > 300:
        raise HTTPException(status_code=401, detail="请求已过期")

    # 读取请求体
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="无效的请求体")

    # 验证数据结构
    required_fields = ['balance', 'daily_checkin', 'transactions', 'updated_at']
    if not all(field in body for field in required_fields):
        raise HTTPException(status_code=400, detail="数据格式错误")

    # 保存数据
    save_device_data(device_id, body)

    return {
        "success": True,
        "message": "同步成功",
        "data": body
    }


@app.delete("/api/sync/{device_id}")
async def delete_credits(
    device_id: str,
    x_timestamp: str = Header(...),
    x_signature: str = Header(...)
):
    """
    删除设备积分数据

    Headers:
        X-Timestamp: 请求时间戳
        X-Signature: HMAC-SHA256 签名
    """
    # 验证签名
    try:
        timestamp = int(x_timestamp)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的时间戳")

    if not verify_signature(device_id, timestamp, x_signature):
        raise HTTPException(status_code=401, detail="签名验证失败")

    # 删除数据文件
    file_path = get_device_file(device_id)
    if file_path.exists():
        file_path.unlink()

    return {
        "success": True,
        "message": "删除成功"
    }


@app.get("/api/devices")
async def list_devices():
    """
    列出所有已同步的设备（管理接口）

    注意：生产环境应该添加认证保护
    """
    devices = []
    for file in DATA_DIR.glob("*.json"):
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                devices.append({
                    "device_id": file.stem,
                    "balance": data.get("balance", 0),
                    "updated_at": data.get("updated_at", "unknown")
                })
        except Exception:
            continue

    return {
        "total": len(devices),
        "devices": devices
    }


# ==================== 启动 ====================

if __name__ == "__main__":
    print(f"🚀 启动积分云同步服务")
    print(f"   端口: {PORT}")
    print(f"   数据目录: {DATA_DIR.absolute()}")
    print(f"   密钥: {SECRET[:8]}...")
    print()

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=PORT,
        reload=False
    )
