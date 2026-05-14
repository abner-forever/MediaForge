"""desktop/app_state 模块单元测试。"""

from __future__ import annotations

from pathlib import Path

from desktop.app_state import AppState


class TestAppState:
    def test_initial_state(self):
        state = AppState()
        assert state.selected_images == []
        assert state.publish_queue == []
        assert state.discovery_results == []
        assert state.image_scores == {}

    def test_add_selected_image(self):
        state = AppState()
        state.add_selected_image("img1.jpg")
        assert state.get_selected_images() == ["img1.jpg"]

    def test_add_duplicate(self):
        state = AppState()
        state.add_selected_image("img1.jpg")
        state.add_selected_image("img1.jpg")
        assert len(state.get_selected_images()) == 1

    def test_remove_selected_image(self):
        state = AppState()
        state.add_selected_image("img1.jpg")
        state.add_selected_image("img2.jpg")
        state.remove_selected_image("img1.jpg")
        assert state.get_selected_images() == ["img2.jpg"]

    def test_remove_not_found(self):
        state = AppState()
        state.remove_selected_image("nonexistent")  # no-op, should not raise

    def test_clear_selected(self):
        state = AppState()
        state.add_selected_image("img1.jpg")
        state.clear_selected_images()
        assert state.get_selected_images() == []

    def test_add_to_queue(self, temp_data_dir):
        state = AppState()
        state.add_to_queue({"title": "test"})
        assert len(state.get_queue()) == 1
        assert "time" in state.get_queue()[0]

    def test_remove_from_queue_valid(self, temp_data_dir):
        state = AppState()
        state.add_to_queue({"title": "a"})
        state.add_to_queue({"title": "b"})
        assert state.remove_from_queue(0) is True
        assert state.get_queue()[0]["title"] == "b"

    def test_remove_from_queue_invalid(self, temp_data_dir):
        state = AppState()
        assert state.remove_from_queue(99) is False

    def test_update_queue_item(self, temp_data_dir):
        state = AppState()
        state.add_to_queue({"title": "old"})
        state.update_queue_item(0, {"title": "new"})
        assert state.get_queue()[0]["title"] == "new"

    def test_add_operation(self, temp_data_dir):
        state = AppState()
        state.add_operation("test_action", "test_detail")
        ops = state.get_operations(10)
        assert any(op["action"] == "test_action" for op in ops)

    def test_discovery_results(self, temp_data_dir):
        state = AppState()
        posts = [{"id": 1}, {"id": 2}]
        state.set_discovery_results(posts)
        assert state.get_discovery_results() == posts

    def test_image_scores(self, temp_data_dir):
        state = AppState()
        scores = {"img1.jpg": {"score": 90}}
        state.set_image_scores(scores)
        assert state.get_image_scores() == scores

    def test_publish_logs(self, temp_data_dir):
        state = AppState()
        state.clear_publish_logs()
        state.add_publish_log("log1")
        state.add_publish_log("log2")
        assert state.get_publish_logs() == ["log1", "log2"]

    def test_finish_publish(self, temp_data_dir):
        state = AppState()
        state.clear_publish_logs()
        assert state.publish_active is True
        state.finish_publish()
        assert state.publish_active is False

    def test_clear_discovery(self, temp_data_dir):
        state = AppState()
        state.set_discovery_results([{"id": 1}])
        state.set_image_scores({"img": {"score": 90}})
        state.clear_discovery_results()
        assert state.get_discovery_results() == []
        assert state.get_image_scores() == {}
