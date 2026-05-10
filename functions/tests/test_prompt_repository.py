from __future__ import annotations

from pathlib import Path

from agents.prompt_repository import PromptRepository


def _make_repo(tmp_path: Path, *, ttl: float = 60.0) -> PromptRepository:
    return PromptRepository(
        prompts_dir=tmp_path,
        firestore_client=object(),
        cache_ttl_seconds=ttl,
    )


def test_get_prompt_prefers_firestore_active_highest_version(tmp_path, monkeypatch):
    monkeypatch.delenv("PROMPT_VERSION_PIN", raising=False)
    monkeypatch.delenv("PROMPT_VERSION_PIN_S2_OCR_PARSE", raising=False)

    (tmp_path / "s2_ocr_parse.txt").write_text("local fallback", encoding="utf-8")
    repo = _make_repo(tmp_path)

    def fake_candidates(_client, step_id: str):
        assert step_id == "s2_ocr_parse"
        return [
            {"id": "older", "data": {"stepId": step_id, "version": 1, "isActive": True, "content": "fire-v1"}},
            {"id": "newest", "data": {"stepId": step_id, "version": 2, "isActive": True, "content": "fire-v2"}},
            {"id": "draft", "data": {"stepId": step_id, "version": 3, "isActive": False, "content": "fire-v3"}},
        ]

    monkeypatch.setattr(repo, "_read_firestore_candidates", fake_candidates)
    assert repo.get_prompt("s2_ocr_parse") == "fire-v2"


def test_get_prompt_honours_explicit_version(tmp_path, monkeypatch):
    (tmp_path / "s6_translation.txt").write_text("local fallback", encoding="utf-8")
    repo = _make_repo(tmp_path)

    monkeypatch.setattr(
        repo,
        "_read_firestore_candidates",
        lambda _client, step_id: [
            {"id": "v1", "data": {"stepId": step_id, "version": 1, "isActive": True, "content": "fire-v1"}},
            {"id": "v2", "data": {"stepId": step_id, "version": 2, "isActive": True, "content": "fire-v2"}},
        ],
    )
    assert repo.get_prompt("s6_translation", version=1) == "fire-v1"


def test_get_prompt_honours_env_version_pin(tmp_path, monkeypatch):
    monkeypatch.setenv("PROMPT_VERSION_PIN_S8_DIRECTOR_NOTE", "2")

    (tmp_path / "s8_director_note.txt").write_text("local fallback", encoding="utf-8")
    repo = _make_repo(tmp_path)

    monkeypatch.setattr(
        repo,
        "_read_firestore_candidates",
        lambda _client, step_id: [
            {"id": "v1", "data": {"stepId": step_id, "version": 1, "isActive": True, "content": "fire-v1"}},
            {"id": "v2", "data": {"stepId": step_id, "version": 2, "isActive": True, "content": "fire-v2"}},
        ],
    )
    assert repo.get_prompt("s8_director_note") == "fire-v2"


def test_get_prompt_falls_back_to_file_when_firestore_empty(tmp_path, monkeypatch):
    monkeypatch.delenv("PROMPT_VERSION_PIN", raising=False)
    monkeypatch.delenv("PROMPT_VERSION_PIN_S1_METADATA_EXTRACT", raising=False)

    (tmp_path / "s1_metadata_extract.txt").write_text("local prompt value", encoding="utf-8")
    repo = _make_repo(tmp_path)
    monkeypatch.setattr(repo, "_read_firestore_candidates", lambda _client, _step_id: [])

    assert repo.get_prompt("s1_metadata_extract") == "local prompt value"


def test_get_prompt_uses_cache_until_ttl(tmp_path, monkeypatch):
    (tmp_path / "s7_voice_recommend.txt").write_text("local fallback", encoding="utf-8")
    repo = _make_repo(tmp_path, ttl=300.0)

    calls = {"count": 0}

    def fake_candidates(_client, step_id: str):
        calls["count"] += 1
        return [{"id": step_id, "data": {"stepId": step_id, "version": 1, "isActive": True, "content": "fire-cached"}}]

    monkeypatch.setattr(repo, "_read_firestore_candidates", fake_candidates)

    assert repo.get_prompt("s7_voice_recommend") == "fire-cached"
    assert repo.get_prompt("s7_voice_recommend") == "fire-cached"
    assert calls["count"] == 1
