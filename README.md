# Class Copilot

本地听课助手。HTTP 与 WebSocket 服务固定运行在 `127.0.0.1:29037`。
后端：FastAPI + SQLAlchemy。前端：Vite + React + TypeScript + Tailwind。

## 快速开始（一键运行）

1. 构建前端：
   ```powershell
   cd frontend
   npm install
   npm run build
   cd ..
   ```
2. 启动后端（会自动挂载 `frontend/dist/`）：
   ```powershell
   uv sync
   uv run python -m class_copilot
   ```
3. 浏览器自动打开 `http://127.0.0.1:29037`。

首次启动会自动创建 `data/`、`data/class_copilot.db`、`data/logs/`、`data/recordings/` 与 `data/.encryption_key`。

## 前端开发模式

需要热更新时建议同时启动两端：

```powershell
# 终端 A：后端
uv run python -m class_copilot

# 终端 B：前端
cd frontend
npm install
npm run dev
```

Vite 会监听 `http://127.0.0.1:5173`，并将 `/api` 与 `/ws` 代理到后端 `127.0.0.1:29037`。

## DashScope API Key

进入应用 → 设置页 → DashScope API Key → 填写并保存。
API Key 使用 Fernet 加密后存入 SQLite，密钥文件位于 `data/.encryption_key`。

也可以直接调用接口：

```powershell
Invoke-RestMethod -Method Patch -Uri http://127.0.0.1:29037/api/settings `
  -ContentType application/json `
  -Body '{"dashscope_api_key":"sk-xxxx"}'
```

## 接口文档

- 自动文档：`http://127.0.0.1:29037/docs`
- 契约源：`docs/260519-plan/contract.md`

如果前端未构建，根路径 `/` 会返回 503，但所有 `/api`、`/ws` 接口仍可使用。
