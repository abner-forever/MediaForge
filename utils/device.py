"""
设备指纹工具

基于硬件信息生成唯一的设备标识符，用于积分云同步。
"""

import hashlib
import platform
import uuid
import json
from pathlib import Path
from utils.file import read_json, write_json
from utils.logger import log

DEVICE_ID_FILE = Path("data/state/device_id.json")


def get_device_fingerprint() -> str:
    """
    生成设备指纹

    组合多个硬件信息生成稳定的设备标识符：
    - MAC 地址
    - 主机名
    - 处理器信息
    - 系统平台
    """
    try:
        # 获取 MAC 地址
        mac = uuid.getnode()
        mac_str = ':'.join(f'{(mac >> i) & 0xff:02x}' for i in range(40, -1, -8))

        # 组合硬件信息
        components = [
            mac_str,
            platform.node(),
            platform.processor(),
            platform.system(),
            platform.machine()
        ]

        # 生成哈希
        raw = '|'.join(str(c) for c in components)
        return hashlib.sha256(raw.encode()).hexdigest()[:32]

    except Exception as e:
        log.error(f"生成设备指纹失败: {e}")
        # 回退方案：使用随机 UUID（每次启动都会变，但至少能工作）
        return uuid.uuid4().hex[:32]


def get_device_id() -> str:
    """
    获取设备ID

    优先从本地缓存读取，如果没有则生成并保存。
    保证同一设备的ID始终一致。
    """
    # 尝试从缓存读取
    cached = read_json(DEVICE_ID_FILE, default=None)
    if cached and 'device_id' in cached:
        return cached['device_id']

    # 生成新的设备ID
    device_id = get_device_fingerprint()

    # 保存到缓存
    write_json(DEVICE_ID_FILE, {'device_id': device_id})
    log.info(f"生成新设备ID: {device_id[:8]}...")

    return device_id


def get_device_info() -> dict:
    """
    获取设备信息摘要（用于调试）
    """
    return {
        'device_id': get_device_id(),
        'hostname': platform.node(),
        'system': platform.system(),
        'release': platform.release(),
        'machine': platform.machine(),
        'processor': platform.processor()
    }
