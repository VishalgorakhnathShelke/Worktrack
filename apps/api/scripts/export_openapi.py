"""Export the FastAPI OpenAPI document used by Swagger UI."""

import json
from pathlib import Path

from worktrace_api.main import app


def main() -> None:
    output = Path(__file__).resolve().parents[1] / "openapi.json"
    output.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
    print(f"Exported Swagger/OpenAPI specification to {output}")


if __name__ == "__main__":
    main()
