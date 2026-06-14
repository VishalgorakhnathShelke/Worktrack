from collections.abc import Generator
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import Select, delete, select
from sqlalchemy.orm import Session

from worktrace_api.database import (
    AIApprovalRecord,
    FeedbackRecord,
    SessionLocal,
    SOPRecord,
    WorkflowSessionRecord,
)
from worktrace_api.schemas import SOP, Feedback, WorkflowSession


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def tenant_query(model: type, tenant_id: UUID) -> Select:
    return select(model).where(model.tenant_id == str(tenant_id))


class Repository:
    def __init__(self, db: Session, tenant_id: UUID):
        self.db = db
        self.tenant_id = tenant_id

    def save_session(self, session: WorkflowSession) -> WorkflowSession:
        self._require_tenant(session.tenant_id)
        record = WorkflowSessionRecord(
            id=str(session.id),
            tenant_id=str(session.tenant_id),
            workflow_name=session.workflow_name,
            status=session.status,
            typed_text_consent=session.typed_text_consent,
            consent_actor=session.consent_actor,
            consent_statement_version=session.consent_statement_version,
            consented_at=session.consented_at,
            external_ai_approved=session.external_ai_approved,
            external_ai_approved_at=session.external_ai_approved_at,
            external_ai_payload_hash=session.external_ai_payload_hash,
            duration_ms=session.duration_ms,
            events=[event.model_dump(mode="json") for event in session.events],
            created_at=session.created_at,
        )
        self.db.add(record)
        self.db.commit()
        return session

    def get_session(self, session_id: UUID) -> WorkflowSession | None:
        record = self.db.scalar(
            tenant_query(WorkflowSessionRecord, self.tenant_id).where(
                WorkflowSessionRecord.id == str(session_id)
            )
        )
        return self._session_from_record(record) if record else None

    def list_sessions(
        self, workflow_name: str | None = None, limit: int | None = None, offset: int = 0
    ) -> list[WorkflowSession]:
        query = tenant_query(WorkflowSessionRecord, self.tenant_id)
        if workflow_name:
            query = query.where(WorkflowSessionRecord.workflow_name == workflow_name)
        query = query.order_by(WorkflowSessionRecord.created_at).offset(offset)
        if limit is not None:
            query = query.limit(limit)
        records = self.db.scalars(query).all()
        return [self._session_from_record(record) for record in records]

    def delete_session(self, session_id: UUID) -> bool:
        session = self.get_session(session_id)
        if not session:
            return False
        session_key = str(session_id)
        self.db.execute(
            delete(AIApprovalRecord).where(
                AIApprovalRecord.tenant_id == str(self.tenant_id),
                AIApprovalRecord.session_id == session_key,
            )
        )
        self.db.execute(
            delete(FeedbackRecord).where(
                FeedbackRecord.tenant_id == str(self.tenant_id),
                FeedbackRecord.session_id == session_key,
            )
        )
        self.db.execute(
            delete(SOPRecord).where(
                SOPRecord.tenant_id == str(self.tenant_id),
                SOPRecord.source_session_id == session_key,
            )
        )
        self.db.execute(
            delete(WorkflowSessionRecord).where(
                WorkflowSessionRecord.tenant_id == str(self.tenant_id),
                WorkflowSessionRecord.id == session_key,
            )
        )
        self.db.commit()
        return True

    def save_sop(self, sop: SOP) -> SOP:
        self._require_tenant(sop.tenant_id)
        record = SOPRecord(
            id=str(sop.id),
            tenant_id=str(sop.tenant_id),
            source_session_id=str(sop.source_session_id),
            version=sop.version,
            status=sop.status,
            title=sop.title,
            steps=[step.model_dump(mode="json") for step in sop.steps],
            created_at=sop.created_at,
        )
        self.db.add(record)
        self.db.commit()
        return sop

    def next_sop_version(self, session_id: UUID) -> int:
        return len(self.list_sops_for_session(session_id)) + 1

    def get_sop(self, sop_id: UUID) -> SOP | None:
        record = self.db.scalar(
            tenant_query(SOPRecord, self.tenant_id).where(SOPRecord.id == str(sop_id))
        )
        return self._sop_from_record(record) if record else None

    def list_sops_for_session(self, session_id: UUID) -> list[SOP]:
        records = self.db.scalars(
            tenant_query(SOPRecord, self.tenant_id)
            .where(SOPRecord.source_session_id == str(session_id))
            .order_by(SOPRecord.version)
        ).all()
        return [self._sop_from_record(record) for record in records]

    def set_sop_status(self, sop_id: UUID, status: str) -> SOP | None:
        record = self.db.scalar(
            tenant_query(SOPRecord, self.tenant_id).where(SOPRecord.id == str(sop_id))
        )
        if not record:
            return None
        record.status = status
        self.db.commit()
        return self._sop_from_record(record)

    def save_feedback(self, feedback: Feedback) -> Feedback:
        self._require_tenant(feedback.tenant_id)
        record = FeedbackRecord(
            id=str(feedback.id),
            tenant_id=str(feedback.tenant_id),
            session_id=str(feedback.session_id),
            sop_step_id=str(feedback.sop_step_id) if feedback.sop_step_id else None,
            transcript=feedback.transcript,
            classification=feedback.classification,
            audio_reference=str(feedback.audio_reference) if feedback.audio_reference else None,
            created_at=feedback.created_at,
        )
        self.db.add(record)
        self.db.commit()
        return feedback

    def list_feedback_for_session(self, session_id: UUID) -> list[Feedback]:
        records = self.db.scalars(
            tenant_query(FeedbackRecord, self.tenant_id)
            .where(FeedbackRecord.session_id == str(session_id))
            .order_by(FeedbackRecord.created_at)
        ).all()
        return [self._feedback_from_record(record) for record in records]

    def sop_step_belongs_to_session(self, session_id: UUID, step_id: UUID) -> bool:
        return any(
            step.id == step_id
            for sop in self.list_sops_for_session(session_id)
            for step in sop.steps
        )

    def record_ai_approval(
        self, session_id: UUID, actor: str, payload_hash: str, approved: bool
    ) -> WorkflowSession | None:
        record = self.db.scalar(
            tenant_query(WorkflowSessionRecord, self.tenant_id).where(
                WorkflowSessionRecord.id == str(session_id)
            )
        )
        if not record:
            return None
        now = datetime.now(UTC)
        record.external_ai_approved = approved
        record.external_ai_approved_at = now
        record.external_ai_payload_hash = payload_hash if approved else None
        self.db.add(
            AIApprovalRecord(
                id=str(uuid4()),
                tenant_id=str(self.tenant_id),
                session_id=str(session_id),
                actor=actor,
                payload_hash=payload_hash,
                approved=approved,
                created_at=now,
            )
        )
        self.db.commit()
        return self._session_from_record(record)

    def _require_tenant(self, tenant_id: UUID) -> None:
        if tenant_id != self.tenant_id:
            raise ValueError("Cross-tenant write rejected")

    @staticmethod
    def _session_from_record(record: WorkflowSessionRecord) -> WorkflowSession:
        return WorkflowSession.model_validate(
            {
                "schema_version": "1.0",
                "tenant_id": record.tenant_id,
                "id": record.id,
                "workflow_name": record.workflow_name,
                "status": record.status,
                "typed_text_consent": record.typed_text_consent,
                "consent_actor": record.consent_actor,
                "consent_statement_version": record.consent_statement_version,
                "consented_at": record.consented_at,
                "external_ai_approved": record.external_ai_approved,
                "external_ai_approved_at": record.external_ai_approved_at,
                "external_ai_payload_hash": record.external_ai_payload_hash,
                "duration_ms": record.duration_ms,
                "events": record.events,
                "created_at": record.created_at,
            }
        )

    @staticmethod
    def _sop_from_record(record: SOPRecord) -> SOP:
        return SOP.model_validate(
            {
                "schema_version": "1.0",
                "tenant_id": record.tenant_id,
                "id": record.id,
                "source_session_id": record.source_session_id,
                "version": record.version,
                "status": record.status,
                "title": record.title,
                "steps": record.steps,
                "created_at": record.created_at,
            }
        )

    @staticmethod
    def _feedback_from_record(record: FeedbackRecord) -> Feedback:
        return Feedback.model_validate(
            {
                "schema_version": "1.0",
                "tenant_id": record.tenant_id,
                "id": record.id,
                "session_id": record.session_id,
                "sop_step_id": record.sop_step_id,
                "transcript": record.transcript,
                "classification": record.classification,
                "audio_reference": record.audio_reference,
                "created_at": record.created_at,
            }
        )
