# Project Context Summary

## Current State
- Repo: `C:\D\class_copilot`
- Remote: `origin = https://github.com/tianzheng-zhou/class_copilot.git`
- Current branch at last check: `main`
- Local helper files added:
  - `start_class_copilot.ps1`
  - `update_class_copilot.ps1`
- Local install state:
  - `.venv` exists
  - Python deps installed with `pip install -e .`
  - Frontend deps installed and built with `npm install` + `npm run build`

## Environment Notes
- The project runs locally at `http://127.0.0.1:29037`
- DashScope API key was configured locally and stored encrypted in:
  - `C:\D\class_copilot\data\class_copilot.db`
- The key should not be echoed back in chat or logs.

## Important Findings
- The “stop listening” / “server internal error” issue is not an API quota symptom.
- Logs showed:
  - `InternalError: Internal service error: null`
  - `response_idle_timeout: no response was generated for 300 seconds`
- This points to ASR/session timeout or server-side handling, not quota exhaustion.
- Closing only the webpage does not stop backend listening.
- Proper shutdown is stopping the backend process (`Ctrl+C` in the launcher terminal, or killing the Python process if needed).

## Relevant Code Areas
- Backend stop flow:
  - `class_copilot/application/session.py`
  - `class_copilot/api/ws/handlers.py`
- Backend error broadcast:
  - `class_copilot/application/session.py` (`_broadcast_error`)
  - `class_copilot/api/http/error_handlers.py`
- Frontend error handling:
  - `frontend/src/App.tsx`
  - `frontend/src/ws/messages.ts`
  - `frontend/src/stores/ui.ts`
  - `frontend/src/stores/session.ts`

## Next Feature Request
- The user wants a fork/branch-based change that:
  - handles server exceptions / idle timeout / other backend failures
  - requests closing the backend cleanly
  - returns error logs or error details
  - surfaces the failure in the website UI/backend view

## Suggested Implementation Direction
- Make stop/listening shutdown idempotent and concurrency-safe.
- Emit structured WS error events for ASR/server failures.
- Attach a short, sanitized log/error summary to the frontend notification path.
- Add tests for:
  - duplicate stop requests
  - ASR idle timeout
  - ASR internal error
  - frontend error display / fatal state

## Operational Reminder
- If continuing this project in the same folder, start from the local repo here:
  - `C:\D\class_copilot`
