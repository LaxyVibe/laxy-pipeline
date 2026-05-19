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
        path: str = "/pipeline/translate-language",
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


def test_translate_language_allows_authenticated_request_without_tenant_claim(monkeypatch: pytest.MonkeyPatch) -> None:
    observed_require_tenant_scope: list[bool] = []

    def _authorise(req, require_tenant_scope=False):
        observed_require_tenant_scope.append(require_tenant_scope)
        return ({
            "role": "client-admin",
            "tenant_id": "",
            "actor_id": "u1",
            "actor_email": "admin@example.com",
        }, None)

    monkeypatch.setattr(functions_main, "_authorise_admin_request", _authorise)

    class _Executor:
        async def translate_language(self, *, scripts: list[dict[str, Any]], target_language: str, core_language: str) -> dict[str, Any]:
            assert target_language == "ja"
            assert core_language == "en"
            assert scripts == [{
                "spotId": "spot_001",
                "spotNumber": 1,
                "title": "Entrance",
                "scriptText": "Welcome to the museum.",
            }]
            return {
                "lang": "ja",
                "label": "Japanese (日本語)",
                "spots": [{
                    "spotId": "spot_001",
                    "spotNumber": 1,
                    "title": "Entrance",
                    "originalText": "Welcome to the museum.",
                    "translatedText": "ミュージアムへようこそ。",
                }],
                "approved": False,
            }

    monkeypatch.setattr(functions_main, "get_executor", lambda: _Executor())
    monkeypatch.setattr(functions_main, "_run_async", lambda coro: asyncio.run(coro))

    response = functions_main.translate_language(FakeRequest(body={
        "scripts": [{
            "spotId": "spot_001",
            "spotNumber": 1,
            "title": "Entrance",
            "scriptText": "Welcome to the museum.",
        }],
        "targetLanguage": "ja",
        "coreLanguage": "en",
    }))

    assert observed_require_tenant_scope == [False]
    assert _extract_status(response) == 200
    payload = _extract_json(response)
    assert payload["lang"] == "ja"
    assert payload["label"] == "Japanese (日本語)"
    assert payload["spots"][0]["translatedText"] == "ミュージアムへようこそ。"


def test_translate_language_rejects_invalid_body(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        functions_main,
        "_authorise_admin_request",
        lambda req, require_tenant_scope=False: ({
            "role": "client-admin",
            "tenant_id": "",
            "actor_id": "u1",
            "actor_email": "admin@example.com",
        }, None),
    )

    response = functions_main.translate_language(FakeRequest(body={}))

    assert _extract_status(response) == 400
    payload = _extract_json(response)
    assert payload["error"]["code"] == "INVALID_REQUEST_BODY"
