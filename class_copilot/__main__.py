from class_copilot.infrastructure.network import apply_ipv4_only_patch; apply_ipv4_only_patch()  # noqa: E702

import threading  # noqa: E402
import time  # noqa: E402
import webbrowser  # noqa: E402
from pathlib import Path  # noqa: E402

import uvicorn  # noqa: E402

from class_copilot.bootstrap import create_app  # noqa: E402
from class_copilot.config import HTTP_HOST, HTTP_PORT, get_config  # noqa: E402
from class_copilot.logging import configure_logging  # noqa: E402


def main() -> None:
    config = get_config()
    configure_logging(config)
    app = create_app(config)
    maybe_open_browser()
    uvicorn.run(app, host=HTTP_HOST, port=HTTP_PORT, log_level="warning")


def maybe_open_browser() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    if not (repo_root / "frontend" / "dist" / "index.html").exists():
        return

    def opener() -> None:
        time.sleep(1.5)
        webbrowser.open(f"http://{HTTP_HOST}:{HTTP_PORT}")

    threading.Thread(target=opener, daemon=True).start()


if __name__ == "__main__":
    main()
