import hashlib
from pathlib import Path
from uuid import UUID

from worktrace_api.schemas import ChunkContentType


class ChunkStorage:
    def __init__(self, root: Path, max_chunk_bytes: int):
        self.root = root
        self.max_chunk_bytes = max_chunk_bytes

    def write(
        self,
        tenant_id: UUID,
        recording_id: UUID,
        chunk_index: int,
        content_type: ChunkContentType,
        payload: bytes,
        expected_checksum: str,
    ) -> tuple[str, int]:
        payload_size = self.validate(payload, expected_checksum)

        directory = self.root / str(tenant_id) / str(recording_id)
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / f"{chunk_index:08d}-{content_type.value}.bin"
        temporary = destination.with_suffix(".tmp")
        temporary.write_bytes(payload)
        temporary.replace(destination)
        return str(destination.relative_to(self.root)), payload_size

    def validate(self, payload: bytes, expected_checksum: str) -> int:
        if not payload:
            raise ValueError("Chunk payload cannot be empty")
        if len(payload) > self.max_chunk_bytes:
            raise ValueError(f"Chunk exceeds maximum size of {self.max_chunk_bytes} bytes")
        actual_checksum = hashlib.sha256(payload).hexdigest()
        if actual_checksum != expected_checksum:
            raise ValueError("Chunk checksum does not match payload")
        return len(payload)

    def delete_recording(self, tenant_id: UUID, recording_id: UUID) -> None:
        directory = self.root / str(tenant_id) / str(recording_id)
        if not directory.exists():
            return
        for file in directory.iterdir():
            if file.is_file():
                file.unlink()
        directory.rmdir()
