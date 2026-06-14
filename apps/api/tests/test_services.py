from datetime import UTC, datetime
from uuid import uuid4

from worktrace_api.schemas import EventType, SessionEvent, WorkflowSession
from worktrace_api.services import analyze_workflow, generate_sop


def make_session(tenant_id, workflow_name="Invoice review"):
    return WorkflowSession(
        tenant_id=tenant_id,
        workflow_name=workflow_name,
        duration_ms=3000,
        events=[
            SessionEvent(
                tenant_id=tenant_id,
                timestamp=datetime.now(UTC),
                event_type=EventType.NAVIGATION,
                page_url="https://example.test/invoices",
                element_text="Invoices",
                duration_ms=1000,
            ),
            SessionEvent(
                tenant_id=tenant_id,
                timestamp=datetime.now(UTC),
                event_type=EventType.CLICK,
                page_url="https://example.test/invoices",
                element_text="Review",
                duration_ms=2000,
            ),
        ],
    )


def test_generates_reviewable_sop():
    tenant_id = uuid4()
    sop = generate_sop(make_session(tenant_id))
    assert sop.status == "draft"
    assert [step.position for step in sop.steps] == [1, 2]
    assert sop.steps[1].title == "Select Review"


def test_disables_clustering_below_eight_sessions():
    tenant_id = uuid4()
    sessions = [make_session(tenant_id) for _ in range(3)]
    result = analyze_workflow(tenant_id, "Invoice review", sessions, None)
    assert result.clustering_status == "disabled_insufficient_sessions"
    assert result.reference_session_id is None
    assert "best performer" not in " ".join(result.executive_summary).lower()


def test_does_not_claim_statistical_clustering_before_implementation():
    tenant_id = uuid4()
    sessions = [make_session(tenant_id) for _ in range(8)]
    result = analyze_workflow(tenant_id, "Invoice review", sessions, None)
    assert result.clustering_status == "not_implemented"


def test_sop_generation_preserves_opaque_screenshot_id():
    tenant_id = uuid4()
    session = make_session(tenant_id)
    screenshot_id = uuid4()
    session.events[0] = session.events[0].model_copy(update={"screenshot_reference": screenshot_id})
    sop = generate_sop(session)
    assert sop.steps[0].screenshot_reference == screenshot_id
