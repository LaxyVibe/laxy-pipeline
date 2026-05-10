from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import firebase_admin
from firebase_admin import auth as fb_auth


def _post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"error": {"message": raw or str(exc)}}
        message = parsed.get("error", {}).get("message", str(exc))
        raise RuntimeError(f"POST {url} failed: {message}") from exc


def _decode_jwt_claims(id_token: str) -> dict[str, Any]:
    parts = id_token.split(".")
    if len(parts) < 2:
        return {}

    payload = parts[1]
    padding = "=" * ((4 - len(payload) % 4) % 4)
    decoded = urllib.parse.unquote(payload)
    import base64

    try:
        data = base64.urlsafe_b64decode((decoded + padding).encode("utf-8"))
        parsed = json.loads(data.decode("utf-8"))
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _signup_or_signin(auth_host: str, api_key: str, email: str, password: str) -> dict[str, Any]:
    sign_up_url = f"http://{auth_host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}"
    sign_in_url = f"http://{auth_host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"

    try:
        return _post_json(sign_up_url, {
            "email": email,
            "password": password,
            "returnSecureToken": True,
        })
    except RuntimeError as exc:
        if "EMAIL_EXISTS" not in str(exc):
            raise
        return _post_json(sign_in_url, {
            "email": email,
            "password": password,
            "returnSecureToken": True,
        })


def ensure_emulator_admin_user(
    *,
    project_id: str,
    auth_host: str,
    api_key: str,
    email: str,
    password: str,
    role: str,
    tenant_id: str,
) -> dict[str, str]:
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = auth_host

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})

    first_auth = _signup_or_signin(auth_host, api_key, email, password)
    uid = str(first_auth.get("localId") or "").strip()
    if not uid:
        raise RuntimeError("Auth emulator did not return localId")

    fb_auth.set_custom_user_claims(uid, {
        "role": role,
        "tenantId": tenant_id,
    })

    sign_in_url = f"http://{auth_host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
    token = ""
    for _ in range(5):
        signed_in = _post_json(sign_in_url, {
            "email": email,
            "password": password,
            "returnSecureToken": True,
        })
        token = str(signed_in.get("idToken") or "")
        claims = _decode_jwt_claims(token)
        if claims.get("role") == role and claims.get("tenantId") == tenant_id:
            break
        time.sleep(0.2)

    if not token:
        raise RuntimeError("Failed to obtain ID token from auth emulator")

    return {
        "uid": uid,
        "email": email,
        "password": password,
        "idToken": token,
        "role": role,
        "tenantId": tenant_id,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Firebase Auth emulator user with custom claims")
    parser.add_argument("--project", dest="project_id", default=os.environ.get("E2E_FIREBASE_PROJECT", "laxy-studio-dev"))
    parser.add_argument("--auth-host", dest="auth_host", default=os.environ.get("E2E_AUTH_HOST", "127.0.0.1:9099"))
    parser.add_argument("--api-key", dest="api_key", default=os.environ.get("E2E_AUTH_API_KEY", "fake-api-key"))
    parser.add_argument("--email", dest="email", default=os.environ.get("E2E_ADMIN_EMAIL", "audio-mvp-e2e-admin@example.com"))
    parser.add_argument("--password", dest="password", default=os.environ.get("E2E_ADMIN_PASSWORD", "Passw0rd123"))
    parser.add_argument("--role", dest="role", default=os.environ.get("E2E_ADMIN_ROLE", "client-admin"))
    parser.add_argument("--tenant", dest="tenant_id", default=os.environ.get("E2E_ADMIN_TENANT", "tenant-e2e"))
    args = parser.parse_args()

    result = ensure_emulator_admin_user(
        project_id=args.project_id,
        auth_host=args.auth_host,
        api_key=args.api_key,
        email=args.email,
        password=args.password,
        role=args.role,
        tenant_id=args.tenant_id,
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
