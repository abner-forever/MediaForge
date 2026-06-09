"""用户认证与管理接口。"""

import re
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional

from services.user import get_user_service, UserProfile
from utils.device import get_device_id
from utils.logger import log

router = APIRouter(tags=["user"])

_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')


def _validate_email(email: str) -> str:
    """基础邮箱格式校验（无需 email-validator 依赖）"""
    if not _EMAIL_RE.match(email):
        raise ValueError("邮箱格式不正确")
    return email


# ==================== 请求模型 ====================

class RegisterRequest(BaseModel):
    """注册请求"""
    email: str
    password: str
    nickname: str
    verification_code: str

    def model_post_init(self, __context) -> None:
        _validate_email(self.email)


class LoginRequest(BaseModel):
    """登录请求"""
    email: str
    password: str

    def model_post_init(self, __context) -> None:
        _validate_email(self.email)


class LoginWithCodeRequest(BaseModel):
    """验证码登录请求"""
    email: str
    verification_code: str

    def model_post_init(self, __context) -> None:
        _validate_email(self.email)


class SendCodeRequest(BaseModel):
    """发送验证码请求"""
    email: str

    def model_post_init(self, __context) -> None:
        _validate_email(self.email)


class UpdateProfileRequest(BaseModel):
    """更新资料请求"""
    nickname: Optional[str] = None
    avatar: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    """重置密码请求（忘记密码）"""
    email: str
    verification_code: str
    new_password: str

    def model_post_init(self, __context) -> None:
        _validate_email(self.email)


class ChangePasswordRequest(BaseModel):
    """修改密码请求（已登录）"""
    old_password: str
    new_password: str


class UpdateSettingsRequest(BaseModel):
    """更新设置请求"""
    settings: dict


class BindDeviceRequest(BaseModel):
    """绑定设备请求"""
    device_id: Optional[str] = None


# ==================== 认证依赖 ====================

async def get_current_user(authorization: str = Header(None)) -> UserProfile:
    """
    获取当前认证用户

    从 Authorization header 中提取 Bearer token
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="未提供认证信息")

    try:
        scheme, token = authorization.split()
        if scheme.lower() != 'bearer':
            raise HTTPException(status_code=401, detail="认证格式错误")
    except ValueError:
        raise HTTPException(status_code=401, detail="认证格式错误")

    user_service = get_user_service()
    user = user_service.get_current_user(token)

    if not user:
        raise HTTPException(status_code=401, detail="认证无效或已过期")

    return user


# ==================== API 端点 ====================

@router.post("/api/user/send-code")
async def send_verification_code(request: SendCodeRequest):
    """
    发送邮箱验证码

    发送6位验证码到指定邮箱
    """
    try:
        user_service = get_user_service()
        success, message = user_service.send_verification_email(request.email)

        return {
            "success": success,
            "message": message
        }
    except Exception as e:
        log.error(f"发送验证码失败: {e}")
        raise HTTPException(status_code=500, detail=f"发送失败: {str(e)}")


@router.post("/api/user/register")
async def register(request: RegisterRequest):
    """
    用户注册

    使用邮箱、密码和验证码注册新用户
    """
    try:
        # 参数验证
        if len(request.password) < 6:
            raise HTTPException(status_code=400, detail="密码至少6位")

        if len(request.nickname) < 1 or len(request.nickname) > 20:
            raise HTTPException(status_code=400, detail="昵称长度1-20位")

        user_service = get_user_service()
        success, message, data = user_service.register(
            email=request.email,
            password=request.password,
            nickname=request.nickname,
            verification_code=request.verification_code
        )

        if success:
            # 自动绑定当前设备
            device_id = get_device_id()
            if device_id:
                user_service.bind_device(data['user']['user_id'], device_id)

            return {
                "success": True,
                "message": message,
                "data": data
            }
        else:
            raise HTTPException(status_code=400, detail=message)

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"注册失败: {e}")
        raise HTTPException(status_code=500, detail=f"注册失败: {str(e)}")


@router.post("/api/user/login")
async def login(request: LoginRequest):
    """
    用户登录

    使用邮箱和密码登录
    """
    try:
        user_service = get_user_service()
        success, message, data = user_service.login(
            email=request.email,
            password=request.password
        )

        if success:
            # 自动绑定当前设备
            device_id = get_device_id()
            if device_id:
                user_service.bind_device(data['user']['user_id'], device_id)

            return {
                "success": True,
                "message": message,
                "data": data
            }
        else:
            raise HTTPException(status_code=401, detail=message)

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"登录失败: {e}")
        raise HTTPException(status_code=500, detail=f"登录失败: {str(e)}")


@router.post("/api/user/login-with-code")
async def login_with_code(request: LoginWithCodeRequest):
    """
    验证码登录

    使用邮箱和验证码登录（无需密码）
    """
    try:
        user_service = get_user_service()
        success, message, data = user_service.login_with_code(
            email=request.email,
            verification_code=request.verification_code
        )

        if success:
            # 自动绑定当前设备
            device_id = get_device_id()
            if device_id:
                user_service.bind_device(data['user']['user_id'], device_id)

            return {
                "success": True,
                "message": message,
                "data": data
            }
        else:
            raise HTTPException(status_code=400, detail=message)

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"验证码登录失败: {e}")
        raise HTTPException(status_code=500, detail=f"验证码登录失败: {str(e)}")


@router.post("/api/user/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """
    重置密码（忘记密码）

    使用邮箱+验证码重置密码
    """
    try:
        if len(request.new_password) < 6:
            raise HTTPException(status_code=400, detail="新密码至少6位")

        user_service = get_user_service()
        success, message = user_service.reset_password(
            email=request.email,
            verification_code=request.verification_code,
            new_password=request.new_password
        )

        if success:
            return {"success": True, "message": message}
        else:
            raise HTTPException(status_code=400, detail=message)

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"重置密码失败: {e}")
        raise HTTPException(status_code=500, detail=f"重置密码失败: {str(e)}")


@router.post("/api/user/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    """
    修改密码（已登录用户）

    需要提供旧密码验证身份
    """
    try:
        if len(request.new_password) < 6:
            raise HTTPException(status_code=400, detail="新密码至少6位")

        user_service = get_user_service()
        success, message = user_service.change_password(
            user_id=current_user.user_id,
            old_password=request.old_password,
            new_password=request.new_password
        )

        if success:
            return {"success": True, "message": message}
        else:
            raise HTTPException(status_code=400, detail=message)

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"修改密码失败: {e}")
        raise HTTPException(status_code=500, detail=f"修改密码失败: {str(e)}")


@router.get("/api/user/profile")
async def get_profile(current_user: UserProfile = Depends(get_current_user)):
    """
    获取当前用户资料

    需要认证
    """
    try:
        user_service = get_user_service()
        profile = user_service.get_profile(current_user.user_id)

        return {
            "success": True,
            "data": profile
        }
    except Exception as e:
        log.error(f"获取资料失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/user/profile")
async def update_profile(
    request: UpdateProfileRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    """
    更新用户资料

    需要认证
    """
    try:
        user_service = get_user_service()
        success, message = user_service.update_profile(
            user_id=current_user.user_id,
            nickname=request.nickname,
            avatar=request.avatar
        )

        return {
            "success": success,
            "message": message
        }
    except Exception as e:
        log.error(f"更新资料失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/user/settings")
async def get_settings(current_user: UserProfile = Depends(get_current_user)):
    """
    获取用户设置

    需要认证
    """
    try:
        user_service = get_user_service()
        settings = user_service.get_settings(current_user.user_id)

        return {
            "success": True,
            "data": settings
        }
    except Exception as e:
        log.error(f"获取设置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/user/settings")
async def update_settings(
    request: UpdateSettingsRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    """
    更新用户设置

    需要认证
    """
    try:
        user_service = get_user_service()
        success, message = user_service.update_settings(
            user_id=current_user.user_id,
            settings=request.settings
        )

        return {
            "success": success,
            "message": message
        }
    except Exception as e:
        log.error(f"更新设置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/user/devices")
async def get_devices(current_user: UserProfile = Depends(get_current_user)):
    """
    获取用户绑定的设备列表

    需要认证
    """
    try:
        user_service = get_user_service()
        devices = user_service.get_user_devices(current_user.user_id)

        return {
            "success": True,
            "data": devices
        }
    except Exception as e:
        log.error(f"获取设备列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/user/bind-device")
async def bind_device(
    request: BindDeviceRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    """
    绑定设备

    需要认证
    """
    try:
        device_id = request.device_id or get_device_id()
        if not device_id:
            raise HTTPException(status_code=400, detail="无法获取设备ID")

        user_service = get_user_service()
        success, message = user_service.bind_device(
            user_id=current_user.user_id,
            device_id=device_id
        )

        return {
            "success": success,
            "message": message
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"绑定设备失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/user/unbind-device")
async def unbind_device(
    request: BindDeviceRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    """
    解绑设备

    需要认证
    """
    try:
        device_id = request.device_id or get_device_id()
        if not device_id:
            raise HTTPException(status_code=400, detail="无法获取设备ID")

        user_service = get_user_service()
        success, message = user_service.unbind_device(
            user_id=current_user.user_id,
            device_id=device_id
        )

        return {
            "success": success,
            "message": message
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"解绑设备失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/user/check-auth")
async def check_auth(current_user: UserProfile = Depends(get_current_user)):
    """
    检查认证状态

    需要认证
    """
    return {
        "success": True,
        "authenticated": True,
        "user_id": current_user.user_id,
        "email": current_user.email,
        "nickname": current_user.nickname
    }


@router.get("/api/user/saved-token")
async def get_saved_token():
    """
    获取本地保存的 token（无需认证）

    用于 PyWebView 重启后恢复登录状态
    """
    user_service = get_user_service()
    token = user_service.load_auth_token()
    if token:
        return {"success": True, "token": token}
    return {"success": False, "token": None}


@router.post("/api/user/logout")
async def logout_endpoint():
    """
    退出登录，清除本地保存的 token
    """
    user_service = get_user_service()
    user_service.clear_auth_token()
    return {"success": True}


@router.get("/api/user/current")
async def get_current_user_info(current_user: UserProfile = Depends(get_current_user)):
    """
    获取当前用户信息

    需要认证
    """
    return {
        "success": True,
        "data": {
            "user_id": current_user.user_id,
            "email": current_user.email,
            "nickname": current_user.nickname,
            "avatar": current_user.avatar,
            "is_verified": current_user.is_verified,
            "created_at": current_user.created_at,
            "last_login": current_user.last_login
        }
    }
