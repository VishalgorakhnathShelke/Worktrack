import os
from pathlib import Path

TEST_DATABASE = Path(__file__).parent / "test.sqlite3"
os.environ["WORKTRACE_DATABASE_URL"] = f"sqlite:///{TEST_DATABASE.as_posix()}"
os.environ["WORKTRACE_RECORDING_STORAGE_PATH"] = str(Path(__file__).parent / "data" / "recordings")
os.environ["WORKTRACE_AI_PROVIDER"] = "local"
os.environ["WORKTRACE_TENANT_ID"] = "00000000-0000-0000-0000-000000000099"
os.environ["WORKTRACE_API_TOKEN"] = "test-api-token"
os.environ["WORKTRACE_ALLOWED_DOMAINS"] = "example.test"

import pytest
from fastapi.testclient import TestClient

from worktrace_api.database import Base, engine
from worktrace_api.main import app


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    TEST_DATABASE.unlink(missing_ok=True)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
