from __future__ import annotations

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


def _on_request(*args, **kwargs):
    def _decorator(func):
        return func

    return _decorator


_mock_https_fn = types.SimpleNamespace(
    Response=_MockResponse,
    Request=object,
    on_request=_on_request,
)
_mock_options = types.SimpleNamespace(MemoryOption=types.SimpleNamespace(GB_2="GB_2"))
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
        path: str = "/pipeline/audio-session-bootstrap",
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


def _audio_session_bootstrap_handler():
    handler = functions_main.audio_session_bootstrap
    for attr in ("__wrapped__", "raw_function", "callback", "_func"):
        candidate = getattr(handler, attr, None)
        if callable(candidate):
            return candidate
    return handler


@pytest.fixture(autouse=True)
def _stub_audit_log(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(functions_main, "_write_audit_log", lambda *args, **kwargs: None)


def test_audio_session_bootstrap_requires_auth_when_missing_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PIPELINE_AUTH_REQUIRED", "true")

    req = FakeRequest(body={"sessionId": "audio-auth-1", "context": {"tenantId": "tenant-1"}})
    response = _audio_session_bootstrap_handler()(req)

    assert _extract_status(response) == 401
    payload = _extract_json(response)
    assert payload["error"]["code"] == "AUTH_REQUIRED"


def test_audio_session_bootstrap_rejects_tenant_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        functions_main,
        "_authorise_admin_request",
        lambda req, require_tenant_scope=True: ({
            "role": "client-admin",
            "tenant_id": "tenant-a",
            "actor_id": "u1",
            "actor_email": "admin@example.com",
        }, None),
    )

    create_session_mock = MagicMock()
    monkeypatch.setattr(functions_main.session_service, "get_session", lambda _sid: None)
    monkeypatch.setattr(functions_main.session_service, "create_session", create_session_mock)

    req = FakeRequest(body={"sessionId": "audio-tenant-mismatch", "context": {"tenantId": "tenant-b"}})
    response = _audio_session_bootstrap_handler()(req)

    assert _extract_status(response) == 403
    payload = _extract_json(response)
    assert payload["error"]["code"] == "FORBIDDEN_TENANT_MISMATCH"
    create_session_mock.assert_not_called()


def test_audio_session_bootstrap_returns_exists_for_existing_session(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        functions_main,
        "_authorise_admin_request",
        lambda req, require_tenant_scope=True: ({
            "role": "client-admin",
            "tenant_id": "tenant-a",
            "actor_id": "u1",
            "actor_email": "admin@example.com",
        }, None),
    )

    existing_session = {"context": {"tenantId": "tenant-a"}}
    get_session_mock = MagicMock(return_value=existing_session)
    create_session_mock = MagicMock()
    update_session_mock = MagicMock()
    monkeypatch.setattr(functions_main.session_service, "get_session", get_session_mock)
    monkeypatch.setattr(functions_main.session_service, "create_session", create_session_mock)
    monkeypatch.setattr(functions_main.session_service, "update_session", update_session_mock)

    req = FakeRequest(body={"sessionId": "audio-existing-1", "context": {"tenantId": "tenant-a"}})
    response = _audio_session_bootstrap_handler()(req)

    assert _extract_status(response) == 200
    payload = _extract_json(response)
    assert payload["success"] is True
    assert payload["status"] == "exists"
    assert payload["tenantId"] == "tenant-a"
    create_session_mock.assert_not_called()
    update_session_mock.assert_not_called()
    assert get_session_mock.call_count >= 1


def test_audio_session_bootstrap_updates_existing_context_when_new_fields_arrive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        functions_main,
        "_authorise_admin_request",
        lambda req, require_tenant_scope=True: ({
            "role": "client-admin",
            "tenant_id": "tenant-a",
            "actor_id": "u1",
            "actor_email": "admin@example.com",
        }, None),
    )

    existing_session = {"context": {"tenantId": "tenant-a", "flow": "audio-mvp"}}
    update_session_mock = MagicMock()
    monkeypatch.setattr(functions_main.session_service, "get_session", lambda _sid: existing_session)
    monkeypatch.setattr(functions_main.session_service, "create_session", MagicMock())
    monkeypatch.setattr(functions_main.session_service, "update_session", update_session_mock)

    req = FakeRequest(body={
        "sessionId": "audio-existing-update-1",
        "context": {
            "tenantId": "tenant-a",
            "audioMvp": {"savedAt": 123},
        },
    })
    response = _audio_session_bootstrap_handler()(req)

    assert _extract_status(response) == 200
    payload = _extract_json(response)
    assert payload["status"] == "exists"
    update_session_mock.assert_called_once()
    update_payload = update_session_mock.call_args.args[1]
    assert update_payload["context"]["tenantId"] == "tenant-a"
    assert update_payload["context"]["flow"] == "audio-mvp"
    assert update_payload["context"]["audioMvp"] == {"savedAt": 123}


def test_audio_session_bootstrap_creates_new_session(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        functions_main,
        "_authorise_admin_request",
        lambda req, require_tenant_scope=True: ({
            "role": "client-admin",
            "tenant_id": "tenant-a",
            "actor_id": "u1",
            "actor_email": "admin@example.com",
        }, None),
    )

    create_session_mock = MagicMock()
    monkeypatch.setattr(functions_main.session_service, "get_session", lambda _sid: None)
    monkeypatch.setattr(functions_main.session_service, "create_session", create_session_mock)

    req = FakeRequest(body={"sessionId": "audio-create-1", "context": {"flow": "audio-mvp"}})
    response = _audio_session_bootstrap_handler()(req)

    assert _extract_status(response) == 200
    payload = _extract_json(response)
    assert payload["success"] is True
    assert payload["status"] == "created"
    assert payload["tenantId"] == "tenant-a"

    create_session_mock.assert_called_once()
    args, _ = create_session_mock.call_args
    assert args[0] == "audio-create-1"
    assert args[1]["question"] == "audio_mvp_session"
    assert args[1]["context"]["tenantId"] == "tenant-a"
