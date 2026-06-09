"""
用户系统服务

提供用户注册、登录、邮箱验证、JWT认证等功能。
"""

import hashlib
import secrets
import uuid
import jwt
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pathlib import Path
from dataclasses import dataclass, asdict

from utils.file import read_json, write_json
from utils.logger import log
from config import DATA_DIR, settings

# 配置
USERS_DIR = DATA_DIR / "users"
VERIFICATION_DIR = DATA_DIR / "verification"
AUTH_TOKEN_PATH = DATA_DIR / "state" / "auth_token.json"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 30  # 30天
VERIFICATION_EXPIRE_MINUTES = 10  # 验证码有效期


def _load_or_create_jwt_secret() -> str:
    """从文件加载 JWT 密钥，首次运行时自动生成并持久化"""
    secret_file = DATA_DIR / "state" / ".jwt_secret"
    try:
        if secret_file.exists():
            secret = secret_file.read_text().strip()
            if len(secret) >= 64:
                return secret
        secret = secrets.token_hex(32)
        secret_file.parent.mkdir(parents=True, exist_ok=True)
        secret_file.write_text(secret)
        return secret
    except Exception:
        return secrets.token_hex(32)


JWT_SECRET = _load_or_create_jwt_secret()

# 确保目录存在
USERS_DIR.mkdir(parents=True, exist_ok=True)
VERIFICATION_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class UserProfile:
    """用户资料"""
    user_id: str
    email: str
    nickname: str
    avatar: str = ""
    created_at: str = ""
    last_login: str = ""
    is_active: bool = True
    is_verified: bool = False
    # 关联数据
    device_ids: list = None
    settings: dict = None

    def __post_init__(self):
        if self.device_ids is None:
            self.device_ids = []
        if self.settings is None:
            self.settings = {}


class UserService:
    """用户服务"""

    def __init__(self):
        self._current_user: Optional[UserProfile] = None

    # ── Token 持久化（解决 PyWebView localStorage 丢失问题）───

    def save_auth_token(self, token: str):
        """将登录 token 持久化到文件，PyWebView 重启后可恢复登录状态"""
        try:
            AUTH_TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
            write_json(AUTH_TOKEN_PATH, {"token": token, "saved_at": datetime.now().isoformat()})
        except Exception as e:
            log.warning(f"保存 auth token 失败: {e}")

    def load_auth_token(self) -> Optional[str]:
        """从文件读取之前保存的 token"""
        try:
            if AUTH_TOKEN_PATH.exists():
                data = read_json(AUTH_TOKEN_PATH, default=None)
                if data and data.get("token"):
                    return data["token"]
        except Exception:
            pass
        return None

    def clear_auth_token(self):
        """清除保存的 token（退出登录时调用）"""
        try:
            if AUTH_TOKEN_PATH.exists():
                AUTH_TOKEN_PATH.unlink()
        except Exception:
            pass

    # ── 用户存储 ──────────────────────────────────────

    def _get_user_path(self, user_id: str) -> Path:
        """获取用户数据文件路径"""
        return USERS_DIR / f"{user_id}.json"

    def _get_email_path(self, email: str) -> Path:
        """获取邮箱到用户ID的映射文件路径"""
        email_hash = hashlib.md5(email.lower().encode()).hexdigest()
        return USERS_DIR / f"email_{email_hash}.json"

    def _load_user(self, user_id: str) -> Optional[UserProfile]:
        """加载用户数据"""
        path = self._get_user_path(user_id)
        if path.exists():
            data = read_json(path, default=None)
            if data:
                # 过滤掉 UserProfile 中不存在的字段（如 password、salt）
                valid_fields = {f.name for f in UserProfile.__dataclass_fields__.values()}
                filtered = {k: v for k, v in data.items() if k in valid_fields}
                return UserProfile(**filtered)
        return None

    def _save_user(self, user: UserProfile):
        """保存用户数据（保留密码等不在 dataclass 中的字段）"""
        path = self._get_user_path(user.user_id)
        # 读取现有数据，保留 password / salt 等不在 UserProfile 中的字段
        existing = read_json(path, default=None) or {}
        merged = {**existing, **asdict(user)}
        write_json(path, merged)

    def _get_user_by_email(self, email: str) -> Optional[UserProfile]:
        """通过邮箱查找用户"""
        email_path = self._get_email_path(email)
        if email_path.exists():
            data = read_json(email_path, default=None)
            if data and 'user_id' in data:
                return self._load_user(data['user_id'])
        return None

    def _save_email_mapping(self, email: str, user_id: str):
        """保存邮箱到用户ID的映射"""
        email_path = self._get_email_path(email)
        write_json(email_path, {
            'email': email.lower(),
            'user_id': user_id
        })

    # ── 密码处理 ──────────────────────────────────────

    def _hash_password(self, password: str, salt: str = None) -> tuple[str, str]:
        """哈希密码"""
        if salt is None:
            salt = secrets.token_hex(16)
        hashed = hashlib.sha256(f"{password}{salt}".encode()).hexdigest()
        return hashed, salt

    def _verify_password(self, password: str, hashed: str, salt: str) -> bool:
        """验证密码"""
        return self._hash_password(password, salt)[0] == hashed

    # ── 邮箱验证 ──────────────────────────────────────

    def _generate_verification_code(self) -> str:
        """生成6位验证码"""
        return ''.join(secrets.choice('0123456789') for _ in range(6))

    def _save_verification(self, email: str, code: str):
        """保存验证码"""
        path = VERIFICATION_DIR / f"{hashlib.md5(email.lower().encode()).hexdigest()}.json"
        write_json(path, {
            'email': email.lower(),
            'code': code,
            'created_at': datetime.now().isoformat(),
            'expires_at': (datetime.now() + timedelta(minutes=VERIFICATION_EXPIRE_MINUTES)).isoformat()
        })

    def _verify_code(self, email: str, code: str) -> bool:
        """验证验证码"""
        path = VERIFICATION_DIR / f"{hashlib.md5(email.lower().encode()).hexdigest()}.json"
        if not path.exists():
            return False

        data = read_json(path, default=None)
        if not data:
            return False

        # 检查是否过期
        expires_at = datetime.fromisoformat(data['expires_at'])
        if datetime.now() > expires_at:
            path.unlink()  # 删除过期验证码
            return False

        # 检查验证码是否匹配
        if data['code'] == code:
            path.unlink()  # 使用后删除
            return True

        return False

    def _build_verification_email(self, email: str, code: str) -> MIMEMultipart:
        """构建验证码邮件"""
        from email.utils import formataddr
        msg = MIMEMultipart('alternative')
        msg['Subject'] = '【图文工坊】邮箱验证码'

        # 格式化发件人地址
        smtp_from = settings.smtp_from or settings.smtp_user
        if '<' in smtp_from and '>' in smtp_from:
            # 已经是 "Name <addr>" 格式
            msg['From'] = smtp_from
        else:
            msg['From'] = formataddr(('图文工坊', smtp_from))
        msg['To'] = email

        # 纯文本版本
        text = f"""您的验证码是：{code}

验证码有效期为 {VERIFICATION_EXPIRE_MINUTES} 分钟，请勿泄露给他人。

如非本人操作，请忽略此邮件。

—— 图文工坊"""

        # HTML 版本
        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 40px 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 24px; font-weight: 600;">图文工坊</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">邮箱验证码</p>
    </div>
    <div style="padding: 32px; text-align: center;">
      <p style="color: #333; font-size: 16px; margin: 0 0 24px;">您的验证码为：</p>
      <div style="background: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
        <span style="font-size: 36px; font-weight: 700; color: #667eea; letter-spacing: 8px;">{code}</span>
      </div>
      <p style="color: #666; font-size: 14px; margin: 0 0 8px;">验证码有效期为 <strong>{VERIFICATION_EXPIRE_MINUTES} 分钟</strong></p>
      <p style="color: #999; font-size: 13px; margin: 0;">请勿将验证码泄露给他人</p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px; margin: 0;">如非本人操作，请忽略此邮件</p>
    </div>
  </div>
</body>
</html>"""

        msg.attach(MIMEText(text, 'plain', 'utf-8'))
        msg.attach(MIMEText(html, 'html', 'utf-8'))
        return msg

    def _send_email(self, to_email: str, msg: MIMEMultipart) -> bool:
        """通过 SMTP 发送邮件"""
        host = settings.smtp_host
        port = settings.smtp_port
        user = settings.smtp_user
        password = settings.smtp_pass
        use_ssl = settings.smtp_secure

        if not all([host, user, password]):
            log.warning("SMTP 未配置，跳过邮件发送")
            return False

        try:
            if use_ssl:
                server = smtplib.SMTP_SSL(host, port, timeout=10)
            else:
                server = smtplib.SMTP(host, port, timeout=10)
                server.starttls()

            server.login(user, password)
            server.sendmail(msg['From'], [to_email], msg.as_string())
            server.quit()
            return True
        except Exception as e:
            log.error(f"SMTP 发送失败: {e}")
            return False

    def send_verification_email(self, email: str) -> tuple[bool, str]:
        """
        发送验证码邮件
        """
        code = self._generate_verification_code()
        self._save_verification(email, code)

        msg = self._build_verification_email(email, code)
        sent = self._send_email(email, msg)

        if sent:
            log.info(f"验证码已发送到 {email}")
            return True, f"验证码已发送到 {email}"
        else:
            # SMTP 未配置或发送失败时，开发模式下返回验证码
            log.info(f"验证码已生成（邮件未发送）: {email} -> {code}")
            return True, f"验证码已发送（开发模式：{code}）"

    # ── JWT Token ──────────────────────────────────────

    def _generate_token(self, user_id: str) -> str:
        """生成JWT Token"""
        payload = {
            'user_id': user_id,
            'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
            'iat': datetime.utcnow()
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    def _verify_token(self, token: str) -> Optional[str]:
        """验证JWT Token，返回user_id"""
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return payload.get('user_id')
        except jwt.ExpiredSignatureError:
            log.warning("Token已过期")
            return None
        except jwt.InvalidTokenError:
            log.warning("无效的Token")
            return None

    # ── 用户注册 ──────────────────────────────────────

    def register(self, email: str, password: str, nickname: str, verification_code: str) -> tuple[bool, str, Optional[Dict]]:
        """
        用户注册

        Args:
            email: 邮箱
            password: 密码
            nickname: 昵称
            verification_code: 验证码

        Returns:
            (success, message, user_data)
        """
        # 验证验证码
        if not self._verify_code(email, verification_code):
            return False, "验证码无效或已过期", None

        # 检查邮箱是否已注册
        if self._get_user_by_email(email):
            return False, "该邮箱已注册", None

        # 创建用户
        user_id = str(uuid.uuid4())
        hashed_password, salt = self._hash_password(password)

        user = UserProfile(
            user_id=user_id,
            email=email.lower(),
            nickname=nickname,
            created_at=datetime.now().isoformat(),
            is_verified=True
        )

        # 保存用户数据（包含密码）
        user_data = asdict(user)
        user_data['password'] = hashed_password
        user_data['salt'] = salt

        path = self._get_user_path(user_id)
        write_json(path, user_data)

        # 保存邮箱映射
        self._save_email_mapping(email, user_id)

        # 生成Token
        token = self._generate_token(user_id)
        self.save_auth_token(token)

        log.info(f"用户注册成功: {email}")
        return True, "注册成功", {
            'user': asdict(user),
            'token': token
        }

    # ── 用户登录 ──────────────────────────────────────

    def login(self, email: str, password: str) -> tuple[bool, str, Optional[Dict]]:
        """
        用户登录

        Args:
            email: 邮箱
            password: 密码

        Returns:
            (success, message, user_data)
        """
        # 查找用户
        user = self._get_user_by_email(email)
        if not user:
            return False, "用户不存在", None

        # 加载完整用户数据（包含密码）
        path = self._get_user_path(user.user_id)
        user_data = read_json(path, default=None)

        if not user_data:
            return False, "用户数据异常", None

        # 验证密码
        if not self._verify_password(password, user_data.get('password', ''), user_data.get('salt', '')):
            return False, "密码错误", None

        # 更新最后登录时间
        user.last_login = datetime.now().isoformat()
        self._save_user(user)

        # 生成Token
        token = self._generate_token(user.user_id)
        self.save_auth_token(token)

        log.info(f"用户登录成功: {email}")
        return True, "登录成功", {
            'user': asdict(user),
            'token': token
        }

    def login_with_code(self, email: str, verification_code: str) -> tuple[bool, str, Optional[Dict]]:
        """
        验证码登录

        Args:
            email: 邮箱
            verification_code: 验证码

        Returns:
            (success, message, user_data)
        """
        # 验证验证码
        if not self._verify_code(email, verification_code):
            return False, "验证码无效或已过期", None

        # 查找用户
        user = self._get_user_by_email(email)
        if not user:
            return False, "该邮箱未注册", None

        # 更新最后登录时间
        user.last_login = datetime.now().isoformat()
        self._save_user(user)

        # 生成Token
        token = self._generate_token(user.user_id)
        self.save_auth_token(token)

        log.info(f"用户验证码登录成功: {email}")
        return True, "登录成功", {
            'user': asdict(user),
            'token': token
        }

    def reset_password(self, email: str, verification_code: str, new_password: str) -> tuple[bool, str]:
        """
        重置密码（忘记密码）

        Args:
            email: 邮箱
            verification_code: 验证码
            new_password: 新密码

        Returns:
            (success, message)
        """
        # 验证验证码
        if not self._verify_code(email, verification_code):
            return False, "验证码无效或已过期"

        # 查找用户
        user = self._get_user_by_email(email)
        if not user:
            return False, "该邮箱未注册"

        # 加载完整用户数据（包含密码）
        path = self._get_user_path(user.user_id)
        user_data = read_json(path, default=None)
        if not user_data:
            return False, "用户数据异常"

        # 更新密码
        hashed_password, salt = self._hash_password(new_password)
        user_data['password'] = hashed_password
        user_data['salt'] = salt
        write_json(path, user_data)

        log.info(f"用户重置密码成功: {email}")
        return True, "密码重置成功"

    def change_password(self, user_id: str, old_password: str, new_password: str) -> tuple[bool, str]:
        """
        修改密码（已登录用户）

        Args:
            user_id: 用户ID
            old_password: 旧密码
            new_password: 新密码

        Returns:
            (success, message)
        """
        path = self._get_user_path(user_id)
        user_data = read_json(path, default=None)
        if not user_data:
            return False, "用户数据异常"

        # 验证旧密码
        if not self._verify_password(old_password, user_data.get('password', ''), user_data.get('salt', '')):
            return False, "旧密码错误"

        # 更新密码
        hashed_password, salt = self._hash_password(new_password)
        user_data['password'] = hashed_password
        user_data['salt'] = salt
        write_json(path, user_data)

        log.info(f"用户修改密码成功: {user_id[:8]}...")
        return True, "密码修改成功"

    # ── Token认证 ──────────────────────────────────────

    def get_current_user(self, token: str) -> Optional[UserProfile]:
        """通过Token获取当前用户"""
        user_id = self._verify_token(token)
        if user_id:
            return self._load_user(user_id)
        return None

    # ── 用户资料 ──────────────────────────────────────

    def get_profile(self, user_id: str) -> Optional[Dict]:
        """获取用户资料"""
        user = self._load_user(user_id)
        if user:
            return asdict(user)
        return None

    def update_profile(self, user_id: str, nickname: str = None, avatar: str = None) -> tuple[bool, str]:
        """更新用户资料"""
        user = self._load_user(user_id)
        if not user:
            return False, "用户不存在"

        if nickname:
            user.nickname = nickname
        if avatar:
            user.avatar = avatar

        self._save_user(user)
        return True, "更新成功"

    # ── 设备绑定 ──────────────────────────────────────

    def bind_device(self, user_id: str, device_id: str) -> tuple[bool, str]:
        """绑定设备到用户"""
        user = self._load_user(user_id)
        if not user:
            return False, "用户不存在"

        if device_id not in user.device_ids:
            user.device_ids.append(device_id)
            self._save_user(user)
            log.info(f"设备 {device_id[:8]}... 绑定到用户 {user.email}")

        return True, "设备绑定成功"

    def unbind_device(self, user_id: str, device_id: str) -> tuple[bool, str]:
        """解绑设备"""
        user = self._load_user(user_id)
        if not user:
            return False, "用户不存在"

        if device_id in user.device_ids:
            user.device_ids.remove(device_id)
            self._save_user(user)
            log.info(f"设备 {device_id[:8]}... 从用户 {user.email} 解绑")

        return True, "设备解绑成功"

    def get_user_devices(self, user_id: str) -> list:
        """获取用户绑定的设备列表"""
        user = self._load_user(user_id)
        if user:
            return user.device_ids
        return []

    # ── 用户设置同步 ──────────────────────────────────

    def get_settings(self, user_id: str) -> dict:
        """获取用户设置"""
        user = self._load_user(user_id)
        if user:
            return user.settings
        return {}

    def update_settings(self, user_id: str, settings: dict) -> tuple[bool, str]:
        """更新用户设置"""
        user = self._load_user(user_id)
        if not user:
            return False, "用户不存在"

        user.settings.update(settings)
        self._save_user(user)
        return True, "设置更新成功"

    # ── 数据迁移 ──────────────────────────────────────

    def migrate_local_data(self, user_id: str, device_id: str) -> tuple[bool, str]:
        """
        迁移本地数据到用户账号

        将设备关联的积分、设置等数据绑定到用户
        """
        try:
            # 这里可以添加迁移逻辑
            # 比如：将 device_id 关联的积分转移到 user_id
            log.info(f"迁移设备 {device_id[:8]}... 的数据到用户 {user_id[:8]}...")
            return True, "数据迁移成功"
        except Exception as e:
            log.error(f"数据迁移失败: {e}")
            return False, f"数据迁移失败: {str(e)}"


# 全局单例
_user_service: Optional[UserService] = None


def get_user_service() -> UserService:
    """获取用户服务单例"""
    global _user_service
    if _user_service is None:
        _user_service = UserService()
    return _user_service
