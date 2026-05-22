from __future__ import annotations

import asyncio
import json
import sys
import types
from typing import Any
from unittest.mock import MagicMock

import pytest

_mock_firebase_admin = MagicMock()
_mock_firebase_admin._apps = {"[DEFAULT]": True}
_mock_firestore = MagicMock()
_mock_firestore.client.return_value = MagicMock()
_mock_firestore.SERVER_TIMESTAMP = object()
_mock_firestore.ArrayUnion.side_effect = lambda values: values
_mock_credentials = MagicMock()
_mock_auth = MagicMock()

_mock_firebase_admin.firestore = _mock_firestore
_mock_firebase_admin.credentials = _mock_credentials
_mock_firebase_admin.auth = _mock_auth

sys.modules.setdefault("firebase_admin", _mock_firebase_admin)
sys.modules.setdefault("firebase_admin.credentials", _mock_credentials)
sys.modules.setdefault("firebase_admin.auth", _mock_auth)
sys.modules.setdefault("firebase_admin.firestore", _mock_firestore)
sys.modules.setdefault("firebase_admin.storage", MagicMock())

_mock_google = MagicMock()
_mock_genai = MagicMock()
_mock_google.genai = _mock_genai
for mod_name, mod_mock in [
    ("google", _mock_google),
    ("google.genai", _mock_genai),
    ("google.genai.types", MagicMock()),
    ("google.adk", MagicMock()),
    ("google.adk.agents", MagicMock()),
    ("google.adk.runners", MagicMock()),
    ("google.adk.sessions", MagicMock()),
]:
    sys.modules.setdefault(mod_name, mod_mock)


class _MockResponse:
    def __init__(self, response: str = "", status: int = 200, headers: dict[str, str] | None = None) -> None:
        self.status_code = status
        self.headers = headers or {}
        self._data = response.encode("utf-8") if isinstance(response, str) else response

    def get_data(self, as_text: bool = False) -> str | bytes:
        if as_text:
            return self._data.decode("utf-8")
        return self._data


class _MockHttpsError(StandardError if "StandardError" in globals() else Exception):
    pass


def _on_request(*args, **kwargs):
    def _decorator(func):
        return func

    return _decorator


_mock_https_fn = types.SimpleNamespace(
    Response=_MockResponse,
    Request=object,
    HttpsError=_MockHttpsError,
    on_request=_on_request,
)
_mock_options = types.SimpleNamespace(MemoryOption=types.SimpleNamespace(GB_1="GB_1", GB_2="GB_2"))
_mock_firebase_functions = types.SimpleNamespace(https_fn=_mock_https_fn, options=_mock_options)
sys.modules.setdefault("firebase_functions", _mock_firebase_functions)

import main as functions_main  # noqa: E402


class FakeRequest:
    def __init__(
        self,
        *,
        method: str = "POST",
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        path: str = "/pipeline/generate-detailed-scene-paragraph",
    ) -> None:
        self.method = method
        self._body = body if body is not None else {}
        self.headers = headers or {}
        self.path = path

    def get_json(self, silent: bool = False) -> dict[str, Any]:
        return self._body


def _extract_status(response: Any) -> int:
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int):
        return status_code
    status = getattr(response, "status", None)
    if isinstance(status, int):
        return status
    if isinstance(status, str):
        return int(status.split(" ", 1)[0])
    raise AssertionError("Unable to extract response status code")


def _extract_json(response: Any) -> dict[str, Any]:
    payload = None
    if hasattr(response, "get_data"):
        payload = response.get_data(as_text=True)
    elif hasattr(response, "data"):
        raw = response.data
        payload = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
    if not payload:
        raise AssertionError("Unable to extract response payload")
    return json.loads(payload)


@pytest.fixture(autouse=True)
def _stub_audit_log(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(functions_main, "_write_audit_log", lambda *args, **kwargs: None)


def test_generate_detailed_scene_paragraph_calls_executor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        functions_main,
        "_authorise_admin_request",
        lambda req, require_tenant_scope=False: ({
            "role": "client-admin",
            "tenant_id": "tenant-e2e",
            "actor_id": "u1",
            "actor_email": "admin@example.com",
        }, None),
    )

    class _Executor:
        async def generate_detailed_scene_paragraph(
            self,
            *,
            guide_name: str,
            spot_name: str,
            character_name: str,
            character_role: str | None = None,
            character_context: str | None = None,
            character_static_instruction: str | None = None,
            where: str | None = None,
            who: str | None = None,
            what: str | None = None,
            how: str | None = None,
        ) -> dict[str, Any]:
            assert guide_name == "Grand Museum Tour"
            assert spot_name == "Main Hall"
            assert character_name == "John"
            assert character_role == "Museum Manager"
            assert character_context == "Formal and confident narrator."
            assert character_static_instruction == "You are John, a calm narrator."
            assert where == "A quiet main hall near the central exhibit."
            assert who == "Families and first-time visitors."
            assert what == "Introduce the hall and help them settle in."
            assert how == "Warm, intimate, and respectful."
            return {
                "success": True,
                "detailedSceneParagraph": (
                    "It is early evening in the museum's main hall, where amber light settles across the stone floor. "
                    "John stands close to the visitors beside the central exhibit, lowering his shoulders and steadying his breath as the room quiets around him. "
                    "The hushed air naturally softens his usual authority into a warmer, more intimate resonance while he keeps his diction precise."
                ),
            }

    monkeypatch.setattr(functions_main, "get_executor", lambda: _Executor())
    monkeypatch.setattr(functions_main, "_run_async", lambda coro: asyncio.run(coro))

    response = functions_main.generate_detailed_scene_paragraph(FakeRequest(body={
        "guideName": "Grand Museum Tour",
        "spotName": "Main Hall",
        "characterName": "John",
        "characterRole": "Museum Manager",
        "characterContext": "Formal and confident narrator.",
        "characterStaticInstruction": "You are John, a calm narrator.",
        "where": "A quiet main hall near the central exhibit.",
        "who": "Families and first-time visitors.",
        "what": "Introduce the hall and help them settle in.",
        "how": "Warm, intimate, and respectful.",
    }))

    assert _extract_status(response) == 200
    payload = _extract_json(response)
    assert payload["success"] is True
    assert "museum's main hall" in payload["detailedSceneParagraph"]


def test_generate_detailed_scene_paragraph_rejects_invalid_body(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        functions_main,
        "_authorise_admin_request",
        lambda req, require_tenant_scope=False: ({
            "role": "client-admin",
            "tenant_id": "tenant-e2e",
            "actor_id": "u1",
            "actor_email": "admin@example.com",
        }, None),
    )

    response = functions_main.generate_detailed_scene_paragraph(FakeRequest(body={
        "guideName": "Grand Museum Tour",
        "spotName": "",
        "characterName": "John",
    }))

    assert _extract_status(response) == 400
    payload = _extract_json(response)
    assert payload["error"]["code"] == "INVALID_REQUEST_BODY"
