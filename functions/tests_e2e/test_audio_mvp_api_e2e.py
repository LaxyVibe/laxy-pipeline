from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

import pytest

from tests_e2e.seed_auth_claims import ensure_emulator_admin_user


PROJECT_ID = os.environ.get("E2E_FIREBASE_PROJECT", "laxy-studio-dev")
REGION = os.environ.get("E2E_FUNCTIONS_REGION", "us-central1")
FUNCTIONS_BASE = os.environ.get("E2E_FUNCTIONS_BASE_URL", f"http://127.0.0.1:5001/{PROJECT_ID}/{REGION}")
AUTH_HOST = os.environ.get("E2E_AUTH_HOST", "127.0.0.1:9099")
AUTH_API_KEY = os.environ.get("E2E_AUTH_API_KEY", "fake-api-key")


@pytest.fixture(scope="module", autouse=True)
def _require_e2e_opt_in() -> None:
    if os.environ.get("RUN_AUDIO_MVP_E2E") != "1":
        pytest.skip("Set RUN_AUDIO_MVP_E2E=1 to run audio MVP API E2E tests")


@pytest.fixture(scope="module")
def admin_identity() -> dict[str, str]:
    return ensure_emulator_admin_user(
        project_id=PROJECT_ID,
        auth_host=AUTH_HOST,
        api_key=AUTH_API_KEY,
        email=os.environ.get("E2E_ADMIN_EMAIL", "audio-mvp-e2e-admin@example.com"),
        password=os.environ.get("E2E_ADMIN_PASSWORD", "Passw0rd123"),
        role=os.environ.get("E2E_ADMIN_ROLE", "client-admin"),
        tenant_id=os.environ.get("E2E_ADMIN_TENANT", "tenant-e2e"),
    )


def _post_json(url: str, payload: dict[str, Any], token: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        raise AssertionError(f"HTTP {exc.code} for {url}: {raw}") from exc


def _endpoint(name: str) -> str:
    return f"{FUNCTIONS_BASE}/{name}"


def _scripts_payload() -> list[dict[str, Any]]:
    return [
        {
            "spotId": "spot_001",
            "spotNumber": 1,
            "title": "Entrance",
            "scriptText": "Welcome to the exhibition.",
        },
        {
            "spotId": "spot_002",
            "spotNumber": 2,
            "title": "Gallery",
            "scriptText": "This room shows modern installations.",
        },
    ]


def test_audio_mvp_bootstrap_and_single_language(admin_identity: dict[str, str]) -> None:
    session_id = f"audio-e2e-{int(time.time() * 1000)}"

    bootstrap_payload = {
        "sessionId": session_id,
        "context": {
            "tenantId": admin_identity["tenantId"],
            "flow": "audio-mvp-e2e",
            "coreLanguage": "en",
            "supportedLanguages": ["en"],
        },
    }
    bootstrap = _post_json(_endpoint("audio_session_bootstrap"), bootstrap_payload, admin_identity["idToken"])
    assert bootstrap["success"] is True
    assert bootstrap["sessionId"] == session_id
    assert bootstrap["tenantId"] == admin_identity["tenantId"]
    assert bootstrap["status"] in {"created", "exists"}

    generate_payload = {
        "sessionId": session_id,
        "voiceId": "Aoede",
        "language": "en",
        "scripts": _scripts_payload(),
    }
    generated = _post_json(_endpoint("audio_generate_language"), generate_payload, admin_identity["idToken"])

    assert generated["lang"] == "en"
    assert len(generated["audioFiles"]) == 2
    assert len(generated["srtFiles"]) == 2
    assert all(item["audioUrl"] for item in generated["audioFiles"])


