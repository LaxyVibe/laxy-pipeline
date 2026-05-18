from __future__ import annotations

import pytest
from pydantic import ValidationError

from contracts.pipeline_contract import (
    API_VERSION,
    AudioSessionBootstrapRequest,
    AudioGenerateLanguageRequest,
    AudioGenerateRequest,
    GenerateJapaneseHiraganaRequest,
    PublishGuideRequest,
    PublishStatusRequest,
    PipelineResumeRequest,
    PipelineStartRequest,
    TranslateLanguageRequest,
    validate_publish_response,
    validate_pipeline_response,
)


def test_start_request_accepts_minimal_payload() -> None:
    model = PipelineStartRequest.model_validate({
        "sessionId": "sess-1",
    })

    assert model.sessionId == "sess-1"
    assert model.question == ""


def test_start_request_validates_idempotency_key_when_provided() -> None:
    payload = PipelineStartRequest.model_validate({
        "sessionId": "sess-1",
        "idempotencyKey": "start-1",
    })
    assert payload.idempotencyKey == "start-1"

    with pytest.raises(ValidationError):
        PipelineStartRequest.model_validate({
            "sessionId": "sess-1",
            "idempotencyKey": "",
        })


def test_resume_request_rejects_invalid_action() -> None:
    with pytest.raises(ValidationError):
        PipelineResumeRequest.model_validate({
            "sessionId": "sess-1",
            "checkpointId": "hg1_data_review",
            "action": "proceed",
        })


def test_resume_request_validates_idempotency_key_when_provided() -> None:
    payload = PipelineResumeRequest.model_validate({
        "sessionId": "sess-1",
        "checkpointId": "hg1_data_review",
        "action": "approve",
        "idempotencyKey": "resume-1",
    })
    assert payload.idempotencyKey == "resume-1"

    with pytest.raises(ValidationError):
        PipelineResumeRequest.model_validate({
            "sessionId": "sess-1",
            "checkpointId": "hg1_data_review",
            "action": "approve",
            "idempotencyKey": "",
        })


def test_validate_pipeline_response_adds_default_version() -> None:
    validated = validate_pipeline_response({
        "sessionId": "sess-1",
        "checkpointId": "hg1_data_review",
        "steps": [
            {
                "stepId": "s2_ocr_parse",
                "label": "S2: OCR Parse (Gemini)",
                "status": "FINISHED",
                "output": {"ok": True},
            }
        ],
        "status": "awaiting_input",
    })

    assert validated["apiVersion"] == API_VERSION
    assert validated["steps"][0]["stepId"] == "s2_ocr_parse"


def test_validate_pipeline_response_rejects_empty_step_id() -> None:
    with pytest.raises(ValidationError):
        validate_pipeline_response({
            "sessionId": "sess-1",
            "steps": [
                {
                    "stepId": "",
                    "label": "S2: OCR Parse (Gemini)",
                    "status": "FINISHED",
                    "output": None,
                }
            ],
            "status": "running",
        })


def test_audio_generate_request_defaults_voice_and_languages() -> None:
    payload = AudioGenerateRequest.model_validate({
        "sessionId": "sess-1",
        "scripts": [{
            "spotId": "s1",
            "spotNumber": 1,
            "title": "Entrance",
            "scriptText": "Hello",
        }],
    })

    assert payload.voiceId == "Aoede"
    assert payload.languages == ["en"]


def test_audio_generate_request_requires_scripts() -> None:
    with pytest.raises(ValidationError):
        AudioGenerateRequest.model_validate({"sessionId": "sess-1"})


def test_audio_generate_language_request_requires_language() -> None:
    with pytest.raises(ValidationError):
        AudioGenerateLanguageRequest.model_validate({
            "sessionId": "sess-1",
            "scripts": [{
                "spotId": "s1",
                "spotNumber": 1,
                "title": "Entrance",
                "scriptText": "Hello",
            }],
        })


def test_audio_session_bootstrap_request_requires_session_id() -> None:
    with pytest.raises(ValidationError):
        AudioSessionBootstrapRequest.model_validate({
            "context": {"tenantId": "tenant-1"},
        })


def test_audio_session_bootstrap_request_accepts_context() -> None:
    payload = AudioSessionBootstrapRequest.model_validate({
        "sessionId": "audio-1",
        "context": {"tenantId": "tenant-1", "flow": "audio-mvp"},
    })
    assert payload.sessionId == "audio-1"
    assert payload.context == {"tenantId": "tenant-1", "flow": "audio-mvp"}


def test_generate_japanese_hiragana_request_requires_script_content() -> None:
    with pytest.raises(ValidationError):
        GenerateJapaneseHiraganaRequest.model_validate({})

    payload = GenerateJapaneseHiraganaRequest.model_validate({
        "scriptContent": "明日、軽やかに風景を描く。",
    })
    assert payload.scriptContent == "明日、軽やかに風景を描く。"


def test_translate_language_request_requires_target_and_core_language() -> None:
    with pytest.raises(ValidationError):
        TranslateLanguageRequest.model_validate({
            "scripts": [{
                "spotId": "s1",
                "spotNumber": 1,
                "title": "Entrance",
                "scriptText": "Hello",
            }],
            "coreLanguage": "en",
        })

    with pytest.raises(ValidationError):
        TranslateLanguageRequest.model_validate({
            "scripts": [{
                "spotId": "s1",
                "spotNumber": 1,
                "title": "Entrance",
                "scriptText": "Hello",
            }],
            "targetLanguage": "es",
        })


def test_publish_request_requires_required_fields() -> None:
    with pytest.raises(ValidationError):
        PublishGuideRequest.model_validate({
            "sessionId": "pub-1",
            "venueName": "",
            "coreLanguage": "en",
            "spotsCount": 1,
            "scriptsCount": 1,
            "slideshowsCount": 1,
            "audioCount": 1,
            "srtCount": 1,
        })


def test_validate_publish_response_schema() -> None:
    validated = validate_publish_response({
        "success": True,
        "publishId": "pub-1",
        "status": "published",
        "guideUrl": "https://guide.laxy.app/g/test",
        "shortUrl": "https://laxy.click/test",
        "slug": "test",
        "qrDataUrl": "data:image/svg+xml;base64,PHN2Zy8+",
        "publishedAt": 1710000000000,
        "retryable": False,
        "attempts": 1,
        "maxAttempts": 3,
    })

    assert validated["status"] == "published"
    assert validated["slug"] == "test"


def test_publish_status_request_requires_publish_id() -> None:
    with pytest.raises(ValidationError):
        PublishStatusRequest.model_validate({"publishId": ""})

    model = PublishStatusRequest.model_validate({"publishId": "pub-1"})
    assert model.publishId == "pub-1"
