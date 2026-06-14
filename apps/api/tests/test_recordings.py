import hashlib

from test_api import auth_headers


def create_recording(client, has_audio=True):
    response = client.post(
        "/recordings",
        headers=auth_headers(),
        json={"workflow_name": "Approve invoice", "has_audio": has_audio},
    )
    assert response.status_code == 201
    return response.json()


def upload_chunk(
    client, recording_id, index, payload=b"chunk", checksum=None, idempotency_key=None
):
    checksum = checksum or hashlib.sha256(payload).hexdigest()
    return client.put(
        f"/recordings/{recording_id}/chunks/{index}",
        headers=auth_headers(),
        data={
            "content_type": "audio" if index == 0 else "events",
            "timestamp_start_ms": index * 10_000,
            "timestamp_end_ms": (index + 1) * 10_000,
            "checksum_sha256": checksum,
            "idempotency_key": idempotency_key or f"{recording_id}:{index}",
            "payload_size": len(payload),
        },
        files={"file": (f"chunk-{index}.bin", payload, "application/octet-stream")},
    )


def test_resumable_chunk_upload_and_status_pipeline(client):
    recording = create_recording(client)
    first = upload_chunk(client, recording["id"], 0, b"audio")
    second = upload_chunk(client, recording["id"], 1, b"events")
    assert first.status_code == 200
    assert second.status_code == 200

    duplicate = upload_chunk(client, recording["id"], 0, b"audio")
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True

    completed = client.post(
        f"/recordings/{recording['id']}/complete",
        headers=auth_headers(),
        json={"expected_chunk_count": 2},
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "validating"
    late = upload_chunk(client, recording["id"], 2, b"late")
    assert late.status_code == 409

    current = client.get(f"/recordings/{recording['id']}/status", headers=auth_headers())
    assert current.status_code == 200
    assert current.json()["recording"]["status"] == "validating"
    assert current.json()["stages"] == [
        "recording",
        "uploading",
        "validating",
        "transcribing_audio",
        "processing_screenshots",
        "aligning_evidence",
        "generating_sop",
        "ready_for_review",
        "completed",
    ]
    repeated = client.get(f"/recordings/{recording['id']}/status", headers=auth_headers())
    assert repeated.json()["recording"]["status"] == "validating"


def test_rejects_checksum_mismatch_and_missing_chunks(client):
    recording = create_recording(client, has_audio=False)
    bad = upload_chunk(client, recording["id"], 0, b"payload", checksum="0" * 64)
    assert bad.status_code == 409

    assert upload_chunk(client, recording["id"], 1, b"events").status_code == 200
    completed = client.post(
        f"/recordings/{recording['id']}/complete",
        headers=auth_headers(),
        json={"expected_chunk_count": 2},
    )
    assert completed.status_code == 409
    assert "missing chunks" in completed.json()["detail"]


def test_rejects_invalid_index_and_declared_size(client):
    recording = create_recording(client)
    negative = upload_chunk(client, recording["id"], -1)
    assert negative.status_code == 422
    wrong_size = client.put(
        f"/recordings/{recording['id']}/chunks/0",
        headers=auth_headers(),
        data={
            "content_type": "events",
            "timestamp_start_ms": 0,
            "timestamp_end_ms": 10_000,
            "checksum_sha256": hashlib.sha256(b"chunk").hexdigest(),
            "idempotency_key": f"{recording['id']}:0",
            "payload_size": 99,
        },
        files={"file": ("chunk.bin", b"chunk", "application/octet-stream")},
    )
    assert wrong_size.status_code == 409


def test_rejects_conflicting_duplicate(client):
    recording = create_recording(client)
    assert upload_chunk(client, recording["id"], 0, b"first").status_code == 200
    conflict = upload_chunk(client, recording["id"], 0, b"second")
    assert conflict.status_code == 409
    key_conflict = upload_chunk(
        client, recording["id"], 0, b"first", idempotency_key="different-key"
    )
    assert key_conflict.status_code == 409
    forged_retry = upload_chunk(
        client,
        recording["id"],
        0,
        b"not-first",
        checksum=hashlib.sha256(b"first").hexdigest(),
    )
    assert forged_retry.status_code == 409


def test_delete_recording_removes_metadata_and_raw_chunks(client):
    recording = create_recording(client)
    assert upload_chunk(client, recording["id"], 0, b"raw-evidence").status_code == 200

    deleted = client.delete(f"/recordings/{recording['id']}", headers=auth_headers())

    assert deleted.status_code == 204
    missing = client.get(f"/recordings/{recording['id']}/status", headers=auth_headers())
    assert missing.status_code == 404
    repeated = client.delete(f"/recordings/{recording['id']}", headers=auth_headers())
    assert repeated.status_code == 404
