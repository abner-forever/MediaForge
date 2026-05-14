"""logger 模块单元测试。"""

from __future__ import annotations

from utils.logger import get_logger


class TestGetLogger:
    def test_returns_logger(self):
        logger = get_logger("test_module")
        assert logger.name == "test_module"

    def test_reuses_handler(self):
        """重复调用不应重复添加 handler。"""
        logger = get_logger("test_reuse")
        count1 = len(logger.handlers)
        logger2 = get_logger("test_reuse")
        assert len(logger2.handlers) == count1

    def test_propagate_false(self):
        """日志不应向根 logger 传播。"""
        logger = get_logger("test_propagate")
        assert logger.propagate is False
