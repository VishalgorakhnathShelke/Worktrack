import hashlib
import json
import re
from collections.abc import Iterable
from urllib.parse import urlsplit, urlunsplit

from pydantic import HttpUrl

from worktrace_api.schemas import ExternalAIPayloadPreview, SessionEvent, WorkflowSession

SENSITIVE_PATTERN = re.compile(
    r"(password|pwd|passcode|secret|token|otp|mfa|credit.?card|cvv|cvc|payment|bank|auth|login|ssn)",
    re.IGNORECASE,
)
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?\d[\d ()-]{7,}\d)(?!\d)")
LONG_NUMBER_PATTERN = re.compile(r"\b\d{9,}\b")


def redact_text(value: str | None) -> tuple[str | None, list[str]]:
    if not value:
        return value, []
    reasons: list[str] = []
    redacted = value
    for pattern, label in (
        (EMAIL_PATTERN, "email"),
        (PHONE_PATTERN, "phone"),
        (LONG_NUMBER_PATTERN, "long_number"),
    ):
        if pattern.search(redacted):
            redacted = pattern.sub(f"[REDACTED_{label.upper()}]", redacted)
            reasons.append(label)
    return redacted, reasons


def safe_url(value: str) -> str:
    parts = urlsplit(value)
    hostname = parts.hostname or ""
    netloc = f"{hostname}:{parts.port}" if parts.port else hostname
    return urlunsplit((parts.scheme, netloc, parts.path, "", ""))


def is_sensitive_event(event: SessionEvent) -> bool:
    candidates: Iterable[str] = (
        event.safe_selector or "",
        event.element_text or "",
        str(event.page_url),
    )
    return any(SENSITIVE_PATTERN.search(candidate) for candidate in candidates)


def sanitize_event(
    event: SessionEvent, typed_text_consent: bool, allowed_domains: list[str] | None = None
) -> SessionEvent:
    reasons = list(event.redaction_reasons)
    hostname = urlsplit(str(event.page_url)).hostname or ""
    if allowed_domains and hostname not in allowed_domains:
        raise ValueError(f"Domain '{hostname}' is not allowed for recording")
    update: dict[str, object] = {"page_url": HttpUrl(safe_url(str(event.page_url)))}

    sensitive = is_sensitive_event(event)
    if not typed_text_consent:
        update["consented_text"] = None
        if event.consented_text:
            reasons.append("typed_text_not_consented")
    elif sensitive:
        update["consented_text"] = None
        reasons.append("sensitive_field")
    else:
        redacted, text_reasons = redact_text(event.consented_text)
        update["consented_text"] = redacted
        reasons.extend(text_reasons)

    if sensitive:
        update["safe_selector"] = None
        update["element_text"] = "[REDACTED_SENSITIVE_FIELD]"
    else:
        safe_selector, selector_reasons = redact_text(event.safe_selector)
        element_text, element_reasons = redact_text(event.element_text)
        update["safe_selector"] = safe_selector
        update["element_text"] = element_text
        reasons.extend(selector_reasons)
        reasons.extend(element_reasons)

    update["redaction_reasons"] = sorted(set(reasons))
    return event.model_copy(update=update)


def sanitize_session(
    session: WorkflowSession, allowed_domains: list[str] | None = None
) -> WorkflowSession:
    events = [
        sanitize_event(event, session.typed_text_consent, allowed_domains)
        for event in session.events
    ]
    return session.model_copy(update={"events": events})


def build_external_ai_preview(session: WorkflowSession, provider: str) -> ExternalAIPayloadPreview:
    approved_events = []
    for event in session.events:
        sensitive = is_sensitive_event(event)
        consented_text, _ = redact_text(event.consented_text)
        element_text, _ = redact_text(event.element_text)
        approved_events.append(
            {
                "event_type": event.event_type,
                "element_text": None if sensitive else element_text,
                "consented_text": None if sensitive else consented_text,
                "duration_ms": event.duration_ms,
            }
        )
    workflow_name, _ = redact_text(session.workflow_name)
    payload = {
        "workflow_name": workflow_name,
        "events": approved_events,
    }
    payload_hash = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return ExternalAIPayloadPreview(
        provider=provider,
        approved=session.external_ai_approved and session.external_ai_payload_hash == payload_hash,
        payload_hash=payload_hash,
        payload=payload,
        excluded_fields=[
            "tenant_id",
            "session_id",
            "full_page_url",
            "safe_selector",
            "screenshot_reference",
            "audio_reference",
        ],
    )
