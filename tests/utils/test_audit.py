"""audit 模块单元测试。"""

from __future__ import annotations

from pathlib import Path

from utils.audit import append_audit, create_run_log_path


class TestAudit:
    def test_creates_path(self, temp_data_dir: Path):
        log_path = create_run_log_path("test_run_001")
        assert log_path.suffix == ".jsonl"
        # 函数只创建目录不创建文件，所以 file 不应存在
        assert log_path.parent.exists()
        assert not log_path.exists()

    def test_append_writes_jsonl(self, temp_data_dir: Path):
        log_path = create_run_log_path("test_run_002")
        append_audit(log_path, "test_action", {"detail": "test_detail"})
        content = log_path.read_text(encoding="utf-8")
        assert "test_action" in content
        assert "test_detail" in content

    def test_multiple_events(self, temp_data_dir: Path):
        log_path = create_run_log_path("test_run_003")
        append_audit(log_path, "action1", {"detail": "detail1"})
        append_audit(log_path, "action2", {"detail": "detail2"})
        lines = log_path.read_text(encoding="utf-8").strip().split("\n")
        assert len(lines) == 2
