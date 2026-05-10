from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"
PROMPT_LIBRARY_PATH = "_platform/system/promptLibrary"
DEFAULT_CACHE_TTL_SECONDS = 60.0


def _read_positive_float_env(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("Invalid float value for %s=%s; using default %.1fs", name, raw, default)
        return default
    if value <= 0:
        logger.warning("Non-positive float value for %s=%s; using default %.1fs", name, raw, default)
        return default
    return value


def _read_bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _normalise_step_env_key(step_id: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", step_id.upper())


@dataclass
class _CachedPrompt:
    content: str
    expires_at: float


class PromptRepository:
    def __init__(
        self,
        *,
        prompts_dir: Path = PROMPTS_DIR,
        collection_path: str = PROMPT_LIBRARY_PATH,
        cache_ttl_seconds: float | None = None,
        firestore_client: Any | None = None,
    ):
        self._prompts_dir = prompts_dir
        self._collection_path = collection_path
        self._cache_ttl_seconds = (
            cache_ttl_seconds
            if cache_ttl_seconds is not None
            else _read_positive_float_env("PROMPT_CACHE_TTL_SECONDS", DEFAULT_CACHE_TTL_SECONDS)
        )
        self._firestore_client = firestore_client
        self._firestore_client_resolved = firestore_client is not None
        self._cache: dict[tuple[str, int | None], _CachedPrompt] = {}

    def clear_cache(self) -> None:
        self._cache.clear()

    def get_prompt(self, step_id: str, *, version: int | None = None) -> str:
        pinned_version = version if version is not None else self._resolve_version_pin(step_id)
        cache_key = (step_id, pinned_version)
        now = time.time()
        cached = self._cache.get(cache_key)
        if cached and cached.expires_at >= now:
            return cached.content

        content = self._load_firestore_prompt(step_id, version=pinned_version)
        if content is None:
            content = self._load_file_prompt(step_id)

        self._cache[cache_key] = _CachedPrompt(
            content=content,
            expires_at=now + self._cache_ttl_seconds,
        )
        return content

    def _resolve_version_pin(self, step_id: str) -> int | None:
        env_keys = [
            f"PROMPT_VERSION_PIN_{_normalise_step_env_key(step_id)}",
            "PROMPT_VERSION_PIN",
        ]
        for env_key in env_keys:
            raw = os.environ.get(env_key)
            if raw is None:
                continue
            try:
                value = int(raw)
            except ValueError:
                logger.warning("Invalid version pin %s=%s; ignoring", env_key, raw)
                continue
            if value > 0:
                return value
            logger.warning("Non-positive version pin %s=%s; ignoring", env_key, raw)
        return None

    def _load_file_prompt(self, step_id: str) -> str:
        path = self._prompts_dir / f"{step_id}.txt"
        return path.read_text(encoding="utf-8").strip()

    def _load_firestore_prompt(self, step_id: str, *, version: int | None) -> str | None:
        if not _read_bool_env("PROMPT_FIRESTORE_ENABLED", True):
            return None

        client = self._resolve_firestore_client()
        if client is None:
            return None

        try:
            candidates = self._read_firestore_candidates(client, step_id)
        except Exception as exc:
            logger.warning("Failed loading Firestore prompts for %s: %s", step_id, exc)
            return None

        selected = self._select_candidate(candidates, step_id=step_id, version=version)
        if not selected:
            return None

        content = self._extract_content(selected.get("data"))
        if not content:
            return None

        selected_version = self._to_int(selected.get("data", {}).get("version"), default=0)
        logger.info(
            "Loaded prompt from Firestore (step=%s, version=%s, doc=%s)",
            step_id,
            selected_version,
            selected.get("id"),
        )
        return content

    def _resolve_firestore_client(self) -> Any | None:
        if self._firestore_client_resolved:
            return self._firestore_client

        self._firestore_client_resolved = True
        try:
            from . import session as session_service

            self._firestore_client = getattr(session_service, "db", None)
        except Exception as exc:
            logger.warning("Firestore client unavailable for PromptRepository: %s", exc)
            self._firestore_client = None
        return self._firestore_client

    def _read_firestore_candidates(self, client: Any, step_id: str) -> list[dict[str, Any]]:
        collection = self._build_collection_ref(client, self._collection_path)
        candidates: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        def add_snapshot(snapshot: Any) -> None:
            if not snapshot or getattr(snapshot, "exists", False) is False:
                return
            try:
                data = snapshot.to_dict()
            except Exception:
                return
            if not isinstance(data, dict):
                return
            doc_id = getattr(snapshot, "id", None)
            dedupe_key = str(doc_id) if doc_id else f"anonymous-{len(candidates)}"
            if dedupe_key in seen_ids:
                return
            seen_ids.add(dedupe_key)
            candidates.append({"id": doc_id, "data": data})

        try:
            add_snapshot(collection.document(step_id).get())
        except Exception:
            pass

        for field in ("stepId", "step_id", "name"):
            try:
                stream = collection.where(field, "==", step_id).limit(20).stream()
            except Exception:
                continue
            for snapshot in stream:
                add_snapshot(snapshot)

        return candidates

    def _build_collection_ref(self, client: Any, path: str) -> Any:
        parts = [segment for segment in path.strip("/").split("/") if segment]
        if not parts or len(parts) % 2 == 0:
            raise ValueError(f"Invalid Firestore collection path: {path}")

        ref: Any = client.collection(parts[0])
        for index, segment in enumerate(parts[1:], start=1):
            if index % 2 == 1:
                ref = ref.document(segment)
            else:
                ref = ref.collection(segment)
        return ref

    def _select_candidate(
        self,
        candidates: list[dict[str, Any]],
        *,
        step_id: str,
        version: int | None,
    ) -> dict[str, Any] | None:
        eligible: list[dict[str, Any]] = []
        for candidate in candidates:
            data = candidate.get("data")
            if not isinstance(data, dict):
                continue
            if not self._extract_content(data):
                continue

            candidate_version = self._to_int(data.get("version"), default=0)
            if version is not None:
                if candidate_version == version:
                    eligible.append(candidate)
                continue

            if self._is_active(data):
                eligible.append(candidate)

        if not eligible:
            return None

        def rank_key(candidate: dict[str, Any]) -> tuple[int, float, int]:
            data = candidate.get("data", {})
            candidate_version = self._to_int(data.get("version"), default=0)
            updated_at = self._timestamp_value(
                data.get("publishedAt")
                or data.get("updatedAt")
                or data.get("createdAt")
            )
            preferred_doc = 1 if candidate.get("id") == step_id else 0
            return (candidate_version, updated_at, preferred_doc)

        return sorted(eligible, key=rank_key, reverse=True)[0]

    def _is_active(self, data: dict[str, Any]) -> bool:
        status = data.get("status")
        if isinstance(status, str):
            return status.strip().lower() in {"published", "active", "enabled"}

        if "isActive" in data:
            return bool(data.get("isActive"))

        if "active" in data:
            return bool(data.get("active"))

        return True

    def _extract_content(self, data: Any) -> str | None:
        if not isinstance(data, dict):
            return None

        for field in ("content", "prompt", "template", "text"):
            value = data.get(field)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    def _to_int(self, value: Any, *, default: int = 0) -> int:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            try:
                return int(value.strip())
            except ValueError:
                return default
        return default

    def _timestamp_value(self, value: Any) -> float:
        if value is None:
            return 0.0
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, datetime):
            return value.timestamp()

        to_datetime = getattr(value, "to_datetime", None)
        if callable(to_datetime):
            try:
                dt = to_datetime()
                if isinstance(dt, datetime):
                    return dt.timestamp()
            except Exception:
                pass

        timestamp_fn = getattr(value, "timestamp", None)
        if callable(timestamp_fn):
            try:
                ts = timestamp_fn()
                if isinstance(ts, (int, float)):
                    return float(ts)
            except Exception:
                pass

        seconds = getattr(value, "seconds", None)
        if isinstance(seconds, (int, float)):
            nanoseconds = getattr(value, "nanoseconds", 0)
            if isinstance(nanoseconds, (int, float)):
                return float(seconds) + float(nanoseconds) / 1_000_000_000
            return float(seconds)

        return 0.0


_prompt_repository: PromptRepository | None = None


def get_prompt_repository() -> PromptRepository:
    global _prompt_repository
    if _prompt_repository is None:
        _prompt_repository = PromptRepository()
    return _prompt_repository


def load_prompt(name: str, *, version: int | None = None) -> str:
    return get_prompt_repository().get_prompt(name, version=version)
