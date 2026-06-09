"""
积分云同步客户端

自动同步积分数据到云端服务器，支持离线缓存和自动重连。
"""

import hashlib
import hmac
import time
import threading
from datetime import datetime
from typing import Optional, Callable
from pathlib import Path

import requests

from utils.device import get_device_id
from utils.logger import log
from utils.file import read_json, write_json

# 同步配置
SYNC_CONFIG_PATH = Path("data/state/sync_config.json")
SYNC_QUEUE_PATH = Path("data/state/sync_queue.json")

# 默认配置
DEFAULT_CONFIG = {
    "enabled": False,
    "server_url": "",
    "secret": "",
    "auto_sync": True,
    "sync_interval": 300,  # 5分钟
    "last_sync": None,
    "device_id": None
}


class CloudSyncClient:
    """
    云同步客户端

    使用方法：
        client = CloudSyncClient()
        client.configure("https://your-server.com", "your-secret")
        client.sync_credits(credits_data)
    """

    def __init__(self):
        self.config = self._load_config()
        self.device_id = get_device_id()
        self._sync_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._on_sync_complete: Optional[Callable] = None

        # 确保设备ID一致
        if not self.config.get('device_id'):
            self.config['device_id'] = self.device_id
            self._save_config()

    def _load_config(self) -> dict:
        """加载同步配置"""
        return read_json(SYNC_CONFIG_PATH, default=DEFAULT_CONFIG.copy())

    def _save_config(self):
        """保存同步配置"""
        write_json(SYNC_CONFIG_PATH, self.config)

    def _generate_signature(self, timestamp: int) -> str:
        """
        生成请求签名

        签名算法：HMAC-SHA256(device_id + timestamp, secret)
        """
        message = f"{self.device_id}{timestamp}"
        return hmac.new(
            self.config['secret'].encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()

    def _get_headers(self) -> dict:
        """获取请求头（包含签名）"""
        timestamp = int(time.time())
        signature = self._generate_signature(timestamp)

        return {
            "X-Timestamp": str(timestamp),
            "X-Signature": signature,
            "Content-Type": "application/json"
        }

    def configure(self, server_url: str, secret: str):
        """
        配置同步服务

        Args:
            server_url: 服务器地址（如 https://sync.example.com）
            secret: 同步密钥
        """
        self.config['server_url'] = server_url.rstrip('/')
        self.config['secret'] = secret
        self.config['enabled'] = True
        self._save_config()

        log.info(f"云同步已配置: {server_url}")

    def disable(self):
        """禁用云同步"""
        self.config['enabled'] = False
        self._save_config()
        self.stop_auto_sync()
        log.info("云同步已禁用")

    def is_configured(self) -> bool:
        """检查是否已配置"""
        return (
            self.config.get('enabled', False) and
            bool(self.config.get('server_url')) and
            bool(self.config.get('secret'))
        )

    def test_connection(self) -> tuple[bool, str]:
        """
        测试服务器连接

        Returns:
            (success, message)
        """
        if not self.is_configured():
            return False, "未配置同步服务"

        try:
            url = f"{self.config['server_url']}/"
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                data = response.json()
                return True, f"连接成功: {data.get('service', 'Unknown')}"
            else:
                return False, f"服务器返回错误: {response.status_code}"

        except requests.exceptions.Timeout:
            return False, "连接超时"
        except requests.exceptions.ConnectionError:
            return False, "无法连接到服务器"
        except Exception as e:
            return False, f"连接失败: {str(e)}"

    def sync_credits(self, credits_data: dict) -> tuple[bool, str]:
        """
        同步积分数据到云端

        Args:
            credits_data: 积分数据字典

        Returns:
            (success, message)
        """
        if not self.is_configured():
            return False, "未配置同步服务"

        try:
            url = f"{self.config['server_url']}/api/sync/{self.device_id}"
            headers = self._get_headers()

            # 添加更新时间
            credits_data['updated_at'] = datetime.now().isoformat()

            response = requests.post(
                url,
                json=credits_data,
                headers=headers,
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    self.config['last_sync'] = datetime.now().isoformat()
                    self._save_config()
                    log.info("积分数据同步成功")
                    return True, "同步成功"
                else:
                    return False, result.get('message', '同步失败')
            elif response.status_code == 401:
                return False, "认证失败，请检查同步密钥"
            else:
                return False, f"服务器错误: {response.status_code}"

        except requests.exceptions.Timeout:
            return False, "同步超时"
        except requests.exceptions.ConnectionError:
            return False, "无法连接到服务器"
        except Exception as e:
            log.error(f"同步失败: {e}")
            return False, f"同步失败: {str(e)}"

    def load_credits(self) -> tuple[bool, dict, str]:
        """
        从云端加载积分数据

        Returns:
            (success, data, message)
        """
        if not self.is_configured():
            return False, {}, "未配置同步服务"

        try:
            url = f"{self.config['server_url']}/api/sync/{self.device_id}"
            headers = self._get_headers()

            response = requests.get(url, headers=headers, timeout=30)

            if response.status_code == 200:
                result = response.json()
                if result.get('success') and result.get('data'):
                    log.info("从云端加载积分数据成功")
                    return True, result['data'], "加载成功"
                else:
                    return False, {}, "云端无数据"
            elif response.status_code == 401:
                return False, {}, "认证失败"
            else:
                return False, {}, f"服务器错误: {response.status_code}"

        except Exception as e:
            log.error(f"加载云端数据失败: {e}")
            return False, {}, f"加载失败: {str(e)}"

    def _auto_sync_worker(self):
        """自动同步后台线程"""
        while not self._stop_event.is_set():
            try:
                # 等待同步间隔
                interval = self.config.get('sync_interval', 300)
                self._stop_event.wait(interval)

                if self._stop_event.is_set():
                    break

                # 尝试同步
                if self.is_configured() and self._on_sync_complete:
                    # 获取最新积分数据
                    credits_data = self._on_sync_complete()
                    if credits_data:
                        success, message = self.sync_credits(credits_data)
                        if success:
                            log.debug("自动同步完成")
                        else:
                            log.warning(f"自动同步失败: {message}")

            except Exception as e:
                log.error(f"自动同步线程错误: {e}")
                time.sleep(60)  # 出错后等待1分钟再重试

    def start_auto_sync(self, get_credits_data: Callable[[], dict]):
        """
        启动自动同步

        Args:
            get_credits_data: 获取积分数据的回调函数
        """
        if self._sync_thread and self._sync_thread.is_alive():
            return

        self._on_sync_complete = get_credits_data
        self._stop_event.clear()

        self._sync_thread = threading.Thread(
            target=self._auto_sync_worker,
            daemon=True,
            name="cloud-sync"
        )
        self._sync_thread.start()

        log.info(f"自动同步已启动，间隔 {self.config.get('sync_interval', 300)} 秒")

    def stop_auto_sync(self):
        """停止自动同步"""
        if self._sync_thread and self._sync_thread.is_alive():
            self._stop_event.set()
            self._sync_thread.join(timeout=5)
            log.info("自动同步已停止")

    def get_status(self) -> dict:
        """
        获取同步状态

        Returns:
            状态信息字典
        """
        return {
            "enabled": self.config.get('enabled', False),
            "configured": self.is_configured(),
            "server_url": self.config.get('server_url', ''),
            "device_id": self.device_id[:8] + "..." if self.device_id else None,
            "last_sync": self.config.get('last_sync'),
            "auto_sync": self.config.get('auto_sync', True),
            "sync_interval": self.config.get('sync_interval', 300),
            "is_syncing": self._sync_thread and self._sync_thread.is_alive()
        }


# 全局单例
_cloud_sync_client: Optional[CloudSyncClient] = None


def get_cloud_sync() -> CloudSyncClient:
    """获取云同步客户端单例"""
    global _cloud_sync_client
    if _cloud_sync_client is None:
        _cloud_sync_client = CloudSyncClient()
    return _cloud_sync_client
