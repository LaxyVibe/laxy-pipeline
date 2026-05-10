from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

API_VERSION = "v1"


class PipelineUpload(BaseModel):
    data: str
    name: str
    mime: str


class PipelineStartRequest(BaseModel):
    question: str = ""
    sessionId: str = Field(min_length=1)
    idempotencyKey: str | None = Field(default=None, min_length=1)
    uploads: list[PipelineUpload] | None = None
    context: dict[str, Any] | None = None


class PipelineResumeRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    checkpointId: str = Field(min_length=1)
    action: Literal["approve", "reject"]
    idempotencyKey: str | None = Field(default=None, min_length=1)
    feedback: str | None = None


class PipelineStatusRequest(BaseModel):
    sessionId: str = Field(min_length=1)


class ScriptRequestItem(BaseModel):
    spotId: str = Field(min_length=1)
    spotNumber: int
    title: str
    scriptText: str


class TranslationTextItem(BaseModel):
    spotId: str = Field(min_length=1)
    translatedText: str


class AudioGenerateRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    scripts: list[ScriptRequestItem] = Field(min_length=1)
    voiceId: str = "Aoede"
    languages: list[str] = Field(default_factory=lambda: ["en"], min_length=1)
    directorNote: dict[str, Any] | None = None
    translations: dict[str, list[TranslationTextItem]] | None = None


class AudioGenerateLanguageRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    scripts: list[ScriptRequestItem] = Field(min_length=1)
    voiceId: str = "Aoede"
    language: str = Field(min_length=1)
    directorNote: dict[str, Any] | None = None
    translations: list[TranslationTextItem] | None = None


class AudioSessionBootstrapRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    context: dict[str, Any] | None = None


class AudioSessionBootstrapResponse(BaseModel):
    success: bool = True
    sessionId: str = Field(min_length=1)
    status: Literal["created", "exists"]
    tenantId: str | None = None


class GenerateDirectorNoteRequest(BaseModel):
    scriptContent: str = Field(min_length=1)
    characterName: str | None = None
    characterRole: str | None = None
    contentVersion: str | None = None
    context: str | None = None


class EnhanceScriptRequest(BaseModel):
    scriptContent: str = Field(min_length=1)
    characterName: str | None = None
    characterRole: str | None = None
    contextDirective: str | None = None


class GenerateCharacterRequest(BaseModel):
    designerPrompt: str = Field(min_length=1)


class TranslateLanguageRequest(BaseModel):
    scripts: list[ScriptRequestItem] = Field(min_length=1)
    targetLanguage: str = Field(min_length=1)
    coreLanguage: str = Field(min_length=1)


class PublishGuideRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    publishId: str | None = Field(default=None, min_length=1)
    retry: bool = False
    venueName: str = Field(min_length=1)
    coreLanguage: str = Field(min_length=1)
    supportedLanguages: list[str] = Field(default_factory=list)
    customSlug: str | None = None
    spotsCount: int = Field(ge=0)
    scriptsCount: int = Field(ge=0)
    slideshowsCount: int = Field(ge=0)
    audioCount: int = Field(ge=0)
    srtCount: int = Field(ge=0)


class PublishGuideResponse(BaseModel):
    success: bool = True
    publishId: str = Field(min_length=1)
    status: Literal["processing", "published", "failed"]
    guideUrl: str = Field(min_length=1)
    shortUrl: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    qrDataUrl: str = Field(min_length=1)
    publishedAt: int
    retryable: bool = False
    attempts: int = Field(ge=1)
    maxAttempts: int = Field(ge=1)


class PublishStatusRequest(BaseModel):
    publishId: str = Field(min_length=1)


class PipelineStepStatus(str, Enum):
    FINISHED = "FINISHED"
    STOPPED = "STOPPED"
    RUNNING = "RUNNING"
    ERROR = "ERROR"


class PipelineStepResponse(BaseModel):
    stepId: str = Field(min_length=1)
    label: str = Field(min_length=1)
    status: PipelineStepStatus
    output: Any | None = None


class PipelineResponse(BaseModel):
    apiVersion: str = API_VERSION
    sessionId: str = Field(min_length=1)
    checkpointId: str | None = None
    steps: list[PipelineStepResponse] = Field(default_factory=list)
    finalText: str | None = None
    status: str | None = None


def validate_pipeline_response(payload: dict[str, Any]) -> dict[str, Any]:
    model = PipelineResponse.model_validate(payload)
    return model.model_dump(mode="json")


def validate_publish_response(payload: dict[str, Any]) -> dict[str, Any]:
    model = PublishGuideResponse.model_validate(payload)
    return model.model_dump(mode="json")
