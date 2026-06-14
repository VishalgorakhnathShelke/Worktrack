from uuid import uuid4

from worktrace_api.privacy import build_external_ai_preview, sanitize_event
from worktrace_api.schemas import EventType, SessionEvent, WorkflowSession


def event(**overrides):
    values = {
        "tenant_id": uuid4(),
        "event_type": EventType.INPUT,
        "page_url": "https://example.test/form?token=secret",
        "safe_selector": "#email",
        "element_text": "Email address",
        "consented_text": "person@example.com",
    }
    values.update(overrides)
    return SessionEvent(**values)


def test_removes_unconsented_typed_text():
    result = sanitize_event(event(), typed_text_consent=False)
    assert result.consented_text is None
    assert "typed_text_not_consented" in result.redaction_reasons
    assert "token=secret" not in str(result.page_url)


def test_never_keeps_sensitive_field_value():
    result = sanitize_event(
        event(safe_selector="input[type=password]", consented_text="do-not-store"),
        typed_text_consent=True,
    )
    assert result.consented_text is None
    assert "sensitive_field" in result.redaction_reasons


def test_redacts_personal_data_from_consented_text():
    result = sanitize_event(event(page_url="https://example.test/form"), typed_text_consent=True)
    assert result.consented_text == "[REDACTED_EMAIL]"


def test_external_ai_preview_excludes_sensitive_element_labels():
    tenant_id = uuid4()
    session = WorkflowSession(
        tenant_id=tenant_id,
        workflow_name="Login",
        typed_text_consent=True,
        consent_actor="Test Operator",
        consent_statement_version="2026-06",
        consented_at="2026-06-12T00:00:00Z",
        events=[
            event(
                tenant_id=tenant_id,
                page_url="https://example.test/login",
                safe_selector="input[type=password]",
                element_text="Password",
                consented_text=None,
            )
        ],
    )

    preview = build_external_ai_preview(session, "local")

    assert preview.payload["events"][0]["element_text"] is None


def test_external_ai_preview_redacts_text_and_excludes_url_paths():
    tenant_id = uuid4()
    session = WorkflowSession(
        tenant_id=tenant_id,
        workflow_name="Process person@example.com",
        typed_text_consent=True,
        consent_actor="Test Operator",
        consent_statement_version="2026-06",
        consented_at="2026-06-12T00:00:00Z",
        events=[
            event(
                tenant_id=tenant_id,
                page_url="https://example.test/private/person@example.com",
                safe_selector="#field-42",
                element_text="Generic field",
                consented_text="person@example.com",
            )
        ],
    )

    preview = build_external_ai_preview(session, "local")

    assert preview.payload["workflow_name"] == "Process [REDACTED_EMAIL]"
    assert preview.payload["events"][0]["consented_text"] == "[REDACTED_EMAIL]"
    assert "page_path" not in preview.payload["events"][0]


def test_strips_url_credentials_and_rejects_unapproved_domain():
    result = sanitize_event(
        event(page_url="https://user:pass@example.test/form?q=secret"),
        typed_text_consent=False,
        allowed_domains=["example.test"],
    )
    assert str(result.page_url) == "https://example.test/form"

    try:
        sanitize_event(
            event(page_url="https://unapproved.test/form"),
            typed_text_consent=False,
            allowed_domains=["example.test"],
        )
    except ValueError as exc:
        assert "not allowed" in str(exc)
    else:
        raise AssertionError("Unapproved domain was accepted")


def test_removes_unconsented_text_from_non_input_events():
    result = sanitize_event(
        event(
            event_type=EventType.NAVIGATION,
            page_url="https://example.test/path",
            element_text="person@example.com",
            consented_text="person@example.com",
        ),
        typed_text_consent=False,
    )
    assert result.consented_text is None
    assert result.element_text == "[REDACTED_EMAIL]"
