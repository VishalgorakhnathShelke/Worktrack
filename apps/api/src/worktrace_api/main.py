from collections.abc import Generator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from hmac import compare_digest
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from worktrace_api.database import create_tables
from worktrace_api.privacy import sanitize_session
from worktrace_api.repository import Repository, get_db
from worktrace_api.schemas import (
    SOP,
    AnalyticsSummary,
    ExportBundle,
    ExternalAIApprovalRequest,
    ExternalAIPayloadPreview,
    Feedback,
    FeedbackCreate,
    SOPApproval,
    SOPStatus,
    WorkflowSession,
    WorkflowSessionCreate,
)
from worktrace_api.services import (
    analyze_workflow,
    classify_feedback,
    external_ai_preview,
    generate_sop,
)
from worktrace_api.settings import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_tables()
    yield


settings = get_settings()
app = FastAPI(title="WorkTrace API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-Tenant-ID"],
)


def authenticated_tenant(
    x_tenant_id: UUID = Header(alias="X-Tenant-ID"),
    authorization: str = Header(alias="Authorization"),
) -> UUID:
    expected = f"Bearer {settings.api_token.get_secret_value()}"
    if x_tenant_id != settings.tenant_id or not compare_digest(authorization, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid tenant credentials"
        )
    return settings.tenant_id


def repository(
    tenant_id: UUID = Depends(authenticated_tenant), db: Session = Depends(get_db)
) -> Generator[Repository, None, None]:
    yield Repository(db, tenant_id)


def require_session(repo: Repository, session_id: UUID) -> WorkflowSession:
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.env}


@app.post("/sessions", response_model=WorkflowSession, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: WorkflowSessionCreate, repo: Repository = Depends(repository)
) -> WorkflowSession:
    if payload.tenant_id != repo.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    try:
        session = WorkflowSession(
            **payload.model_dump(),
            consented_at=datetime.now(UTC) if payload.typed_text_consent else None,
        )
        return repo.save_session(sanitize_session(session, settings.allowed_domains))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


@app.get("/sessions", response_model=list[WorkflowSession])
def list_sessions(
    workflow_name: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    repo: Repository = Depends(repository),
) -> list[WorkflowSession]:
    return repo.list_sessions(workflow_name, limit, offset)


@app.get("/sessions/{session_id}", response_model=WorkflowSession)
def get_session(session_id: UUID, repo: Repository = Depends(repository)) -> WorkflowSession:
    return require_session(repo, session_id)


@app.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: UUID, repo: Repository = Depends(repository)) -> Response:
    if not repo.delete_session(session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/sessions/{session_id}/ai-preview", response_model=ExternalAIPayloadPreview)
def preview_external_ai(
    session_id: UUID, repo: Repository = Depends(repository)
) -> ExternalAIPayloadPreview:
    session = require_session(repo, session_id)
    return external_ai_preview(session, settings.ai_provider)


@app.post("/sessions/{session_id}/ai-approval", response_model=WorkflowSession)
def set_external_ai_approval(
    session_id: UUID,
    payload: ExternalAIApprovalRequest,
    repo: Repository = Depends(repository),
) -> WorkflowSession:
    session = require_session(repo, session_id)
    preview = external_ai_preview(session, settings.ai_provider)
    if payload.payload_hash != preview.payload_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payload changed; review and approve the latest preview",
        )
    approved = repo.record_ai_approval(
        session_id, payload.actor, payload.payload_hash, payload.approved
    )
    if not approved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return approved


@app.post("/sessions/{session_id}/sops", response_model=SOP, status_code=status.HTTP_201_CREATED)
def create_sop(session_id: UUID, repo: Repository = Depends(repository)) -> SOP:
    session = require_session(repo, session_id)
    try:
        return repo.save_sop(generate_sop(session, repo.next_sop_version(session_id)))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


@app.get("/sops/{sop_id}", response_model=SOP)
def get_sop(sop_id: UUID, repo: Repository = Depends(repository)) -> SOP:
    sop = repo.get_sop(sop_id)
    if not sop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOP not found")
    return sop


@app.get("/walkthroughs/{sop_id}", response_model=SOP)
def get_walkthrough(sop_id: UUID, repo: Repository = Depends(repository)) -> SOP:
    sop = repo.get_sop(sop_id)
    if not sop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOP not found")
    if sop.status != SOPStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved SOPs can be published as walkthroughs",
        )
    return sop


@app.post("/sops/{sop_id}/approval", response_model=SOP)
def approve_sop(sop_id: UUID, payload: SOPApproval, repo: Repository = Depends(repository)) -> SOP:
    sop = repo.set_sop_status(sop_id, SOPStatus.APPROVED if payload.approved else SOPStatus.DRAFT)
    if not sop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOP not found")
    return sop


@app.post("/feedback", response_model=Feedback, status_code=status.HTTP_201_CREATED)
def create_feedback(payload: FeedbackCreate, repo: Repository = Depends(repository)) -> Feedback:
    require_session(repo, payload.session_id)
    if payload.sop_step_id and not repo.sop_step_belongs_to_session(
        payload.session_id, payload.sop_step_id
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="SOP step does not belong to the feedback session",
        )
    return repo.save_feedback(classify_feedback(repo.tenant_id, payload))


@app.get("/exports/{session_id}", response_model=ExportBundle)
def export_session(session_id: UUID, repo: Repository = Depends(repository)) -> ExportBundle:
    session = require_session(repo, session_id)
    return ExportBundle(
        tenant_id=repo.tenant_id,
        session=session,
        sops=repo.list_sops_for_session(session_id),
        feedback=repo.list_feedback_for_session(session_id),
    )


@app.get("/analytics/{workflow_name}", response_model=AnalyticsSummary)
def workflow_analytics(
    workflow_name: str,
    reference_session_id: UUID | None = None,
    repo: Repository = Depends(repository),
) -> AnalyticsSummary:
    sessions = repo.list_sessions(workflow_name, limit=500)
    if not sessions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return analyze_workflow(repo.tenant_id, workflow_name, sessions, reference_session_id)
