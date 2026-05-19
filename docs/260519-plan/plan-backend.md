# 后端重构计划（GPT 执行）

> 配套文档：`plan.md`（项目背景与共同约束）、`contract.md`（前后端契约）。**本文件中关于 API / WS 的任何字段、格式约定，以 `contract.md` 为准；如发现 plan-backend 与 contract 冲突，先改 contract，再回来改本文件。**

---

## 1. 范围

实现 `class_copilot/` 后端代码，完成：

- 音频采集（麦克风 + 系统回环）+ MP3 编码
- Qwen3.5-Omni-Realtime ASR（含 12 分钟会话轮换、前文上下文注入、`force_commit`、1 次重连）
- LLM（DashScope compatible-mode）：问题检测、答案生成、主动提问
- SQLite 存储、设置加密、Markdown 导出
- FastAPI HTTP + WebSocket 接口（严格按 `contract.md`）
- IPv4-only 网络补丁
- 前端静态产物挂载（`frontend/dist/` 存在时）

**不包含**：前端代码（在 `plan-frontend.md`）。

---

## 2. 设计原则

1. 分层：`domain`（接口）/ `infrastructure`（实现）/ `application`（用例）/ `api`（HTTP + WS）
2. 接口替代 `hasattr` 鸭子类型
3. 配置单一来源
4. 异常显式抛出，禁止 `except Exception: pass`
5. 关键逻辑可单测（fake ASR / fake LLM）

---

## 3. 目录结构

```
class_copilot/
├── domain/
│   ├── exceptions.py     # ASRConnectionError / ASRPermanentError / ConfigurationError / AudioDeviceError
│   └── ports.py          # RealtimeASRPort, LLMPort
├── infrastructure/
│   ├── persistence/
│   │   ├── orm.py        # SQLAlchemy 模型
│   │   └── repositories.py
│   ├── asr/
│   │   └── qwen_omni.py  # 唯一 ASR 实现，依赖 dashscope SDK
│   ├── llm/
│   │   └── openai_compatible.py  # DashScope compatible-mode，走 openai SDK
│   ├── audio/
│   │   ├── capture.py    # mic + 可选 loopback
│   │   ├── encoder.py    # MP3Encoder
│   │   └── monitor.py    # 音量监控（10 Hz 节流推送）
│   ├── crypto.py         # Fernet 密钥管理
│   └── network.py        # IPv4-only 补丁
├── application/
│   ├── session.py        # SessionService + ASRPipeline + AutoStop
│   ├── question.py       # QuestionDetector + AnswerGenerator
│   ├── chat.py           # ChatService
│   └── settings.py       # SettingsService（DB ↔ 内存）
├── api/
│   ├── http/
│   │   ├── routes.py             # 见 contract.md §2
│   │   └── error_handlers.py
│   ├── ws/
│   │   ├── connection.py         # ConnectionManager
│   │   └── handlers.py           # 见 contract.md §3.2
│   └── schemas.py                # Pydantic 模型，与 contract.md §2 / §3 一一对应
├── config.py             # pydantic-settings：数据目录、log 目录、force_ipv4 开关
├── logging.py            # loguru 配置（控制台 + app/error/asr/llm/ws 五个 sink）
├── db.py                 # engine + session factory + create_all
├── bootstrap.py          # create_app + lifespan
└── __main__.py
```

仓库根：

```
.
├── class_copilot/        # 后端 package
├── frontend/             # 前端 SPA（Claude 写，详见 plan-frontend.md）；后端不要碰
├── tests/
│   ├── fakes/            # fake ASR / fake LLM
│   └── test_*.py
├── data/                 # 运行时数据（不入版本控制，但 dir 要在启动时确保存在）
│   ├── class_copilot.db
│   ├── recordings/
│   ├── logs/
│   └── .encryption_key
├── pyproject.toml
├── uv.lock
└── README.md
```

固定值：

- HTTP 端口 `29037`（写死，不读 .env）
- 默认数据目录 `./data/`（pydantic-settings 可通过 `CC_DATA_DIR` 覆盖）
- 默认日志目录 `data/logs/`
- 加密密钥文件 `data/.encryption_key`
- `force_ipv4` 默认 `true`，可通过 `CC_FORCE_IPV4=false` 关闭
- 录音文件命名 `{session_id}.mp3`（导出端点处再 rename 成有意义的名字）
- MP3 编码：128 kbps、单声道、采样率 16000

---

## 4. 数据模型

| 表 | 字段 |
|---|---|
| `courses` | id (uuid pk), name (unique), created_at, updated_at |
| `sessions` | id (uuid pk), course_id (fk), custom_name (nullable), date (YYYY-MM-DD), started_at, ended_at (nullable), status (`active`/`stopped`/`interrupted`), recording_path, recording_duration_seconds, recording_file_size_bytes |
| `transcriptions` | id (uuid pk), session_id (fk), sequence (int), start_time (float epoch), end_time (float epoch), text, is_final (bool), created_at |
| `questions` | id (uuid pk), session_id (fk), question_text, source (`auto`/`manual`), confidence (float), context_text (nullable), created_at |
| `answers` | id (uuid pk), question_id (fk), answer_type (`brief`/`detailed`), content, created_at, updated_at；UNIQUE(question_id, answer_type) |
| `chat_messages` | id (uuid pk), session_id (fk), role (`user`/`assistant`), content, model_used (nullable), created_at |
| `settings` | key (pk str), value (str), is_encrypted (bool), updated_at |

约定：

- `*_at` 字段：SQLAlchemy `DateTime`（UTC aware），API 输出 ISO 8601 + `Z`
- `start_time` / `end_time`：epoch float，毫秒精度
- ForeignKey 全部 `ON DELETE CASCADE`
- 数据库初始化：启动时 `Base.metadata.create_all`；不引入 Alembic
- 旧库不保留：上线前清空 `data/class_copilot.db*` 和 `data/recordings/`

---

## 5. 关键模块

### 5.1 RealtimeASRPort

```python
class RealtimeASRPort(Protocol):
    result_queue: asyncio.Queue
    is_running: bool
    is_disconnected: bool
    is_permanent_error: bool
    last_error_code: int | str | None
    needs_rotation: bool
    last_text_activity_elapsed: float

    async def pre_connect(self) -> None: ...
    async def start(self, *, language: str) -> None: ...
    async def send_audio(self, pcm: bytes) -> None: ...
    async def stop(self) -> None: ...
    async def force_commit(self) -> None: ...
    async def rotate_session(self) -> None: ...
```

`infrastructure/asr/qwen_omni.py` 实现该 Protocol。
测试用 `FakeASR` 放 `tests/fakes/asr.py`。

### 5.2 SessionService 拆解

| 组件 | 职责 |
|---|---|
| `SessionService` | start / stop / toggle 会话；持有当前 session 状态 |
| `ASRPipeline` | feed_audio（音频队列 → ASR）；process_results（ASR queue → DB + 广播）；监控断线后 1 次重连；监控 `needs_rotation` 自动轮换；监控 `last_text_activity_elapsed >= vad_max_segment_seconds` 时调 `force_commit` |
| `QuestionDetector` | 冷却 / 去重 / 置信度过滤；累积转写缓冲 |
| `AnswerGenerator` | 单档流式答案（按 `auto_answer_type` 选 brief / detailed） |
| `AutoStop` | 定时停止 + tick 推送（最后 60s 每秒推、之前每 10s 推一次） |
| `ConnectionManager` | WebSocket 广播；`set[WebSocket]` + 并发 `send_json`，捕获 `ConnectionClosed` 删除 |

`SessionService` 直接持有 `ConnectionManager`，事件直接 `await cm.broadcast({...})`。无中间事件总线。

### 5.3 重连逻辑

```python
async def _supervise_asr(self):
    while self.is_listening:
        if self.asr.is_permanent_error:
            await self._broadcast_error("asr_permanent", ...)
            await self.stop_listening(reason="interrupted")
            return
        if self.asr.is_disconnected:
            ok = await self._reconnect_once()
            if not ok:
                await self._broadcast_error("asr_unavailable", ...)
                await self.stop_listening(reason="interrupted")
                return
        if self.asr.needs_rotation:
            await self._broadcast_notification("info", "正在刷新语音连接...")
            await self.asr.rotate_session()
        if self.asr.last_text_activity_elapsed >= settings.vad_max_segment_seconds > 0:
            await self.asr.force_commit()
        await asyncio.sleep(0.5)
```

`_reconnect_once` 做 stop → 短暂等待 → start。失败立即返回 False，不再重试。

### 5.4 配置

- `config.py`：pydantic-settings 读 `.env`，启动时静态值（数据目录、日志目录、加密密钥路径、`force_ipv4` 开关）；端口写死 29037
- `application/settings.py` 提供 `SettingsService`：
  - `get_all()` → 构造 `RuntimeSettings` dataclass
  - `update(partial: dict)` → 落库 + 更新内存 + 调相关组件 setter
  - 每个 key 有显式类型注解，从 DB 读字符串后按类型反序列化（不靠 `json.loads` 试探）
- 加密字段在落库前用 Fernet 加密，读取时解密；GET 接口返回脱敏 `前4字符****`

预期 settings keys（与 contract.md §2.3 对齐）：

```
dashscope_api_key (str, 加密)
language (str: zh/en)
auto_answer_type (str: brief/detailed)
asr_model (str: qwen3.5-omni-flash-realtime / qwen3.5-omni-plus-realtime)
chat_model_default (str, 默认 qwen3.5-plus)
chat_model_fast (str, 默认 qwen3.5-flash)
vad_threshold (float)
vad_prefix_padding_ms (int)
vad_silence_duration_ms (int)
asr_session_rotate_minutes (float)
vad_max_segment_seconds (float)
question_confidence_threshold (float)
question_cooldown_seconds (int)
question_similarity_threshold (float)
audio_source (str: microphone/loopback)
audio_device_id (int | str | None)
```

### 5.5 加密

- Fernet 密钥独立存 `data/.encryption_key`，**不写 `.env`**
- 启动时不存在则生成（幂等）；权限设为 0600（POSIX）/ 默认 ACL（Windows，靠目录权限）
- 解密失败抛 `ConfigurationError`，日志记录 key 名，**不阻断启动**；UI 提示重设

### 5.6 WebSocket

- `ConnectionManager._active: set[WebSocket]`
- `broadcast()` 并发 `send_json`，捕获 `ConnectionClosed` 从 set 删除
- 不需要 `asyncio.Lock`（同一 event loop）
- 客户端连上立即推一条 `status` 事件，反映当前会话状态

### 5.7 错误处理

- 领域异常集中 `domain/exceptions.py`：`ASRConnectionError` / `ASRPermanentError` / `ConfigurationError` / `AudioDeviceError`
- `api/http/error_handlers.py` 统一注册 `exception_handler`：
  - `ConfigurationError` → 400
  - `AudioDeviceError` → 400
  - 其他 `Exception` → 500，日志 traceback
- `ASRConnectionError` / `ASRPermanentError` 仅在 WS 路径中产生（HTTP 路由不直接调 ASR），不进 HTTP error_handler
- WS handler 内异常 → 推 `error` 事件 + 日志

### 5.8 录音

- `AudioCapture` 异步上下文管理器；`async with` 入口启动线程，出口确保线程结束
- 退出顺序：stop sounddevice 流 → `threading.Event` 通知线程退出 + join → flush MP3 encoder → close 文件
- `audio_queue` 满时计数 + 周期性 warn（5s 一次）
- `loop.call_soon_threadsafe(...)` 在 loop 关闭时不崩
- `soundcard` 探测：尝试 `sc.default_speaker()` + `sc.get_microphone(include_loopback=True)`，捕获异常 → `loopback.available = False`

### 5.9 监控（mic level）

- 节流到 10 Hz：内部累积音频块计算 RMS / peak / clipping，每 100ms 推一条 `mic_level`
- 后端用 `time.monotonic()` 控制最小间隔

### 5.10 网络补丁

- 默认开启，`CC_FORCE_IPV4=false` 可关
- `apply_ipv4_only_patch()` + `unpatch()`（测试用）
- 仅作用于 `*.dashscope.aliyuncs.com` 后缀
- **入口必须在 `__main__.py` 的最早位置调用**（必须在任何 `dashscope` 或 `openai` 模块导入前）

### 5.11 LLM

- `LLMPort`：`detect_question` / `generate_answer` / `chat`
- `infrastructure/llm/openai_compatible.py` 用 `openai.AsyncOpenAI` + DashScope `compatible-mode` base URL
- 模型选择（统一使用 Qwen3.5 系列，不用 3.6 节省成本；详见 `plan.md` §模型选型）：
  - 问题检测：`qwen3.5-flash`
  - 答案生成（brief / detailed）：`qwen3.5-flash`（高频，省 token）
  - 主动提问 chat 默认：`qwen3.5-plus`；`model="fast"` 切到 `qwen3.5-flash`
- 实时 ASR 模型由 `RuntimeSettings.asr_model` 决定（默认 `qwen3.5-omni-flash-realtime`，可选 `qwen3.5-omni-plus-realtime`）
- **所有 LLM 调用必须显式关闭深度思考**：传 `extra_body={"enable_thinking": False}`。Qwen3.5 商业版默认开启，会显著拖慢响应并翻倍 token 消耗。详见 `reference/深度思考.md`
- API key 变更：`SettingsService.update` 调 `LLMService.set_api_key()`，重建 `AsyncOpenAI` 实例

### 5.12 Markdown 导出

- 后端只输出 UTC ISO 字符串（带 `Z` 后缀）；前端展示时转本地时区
- 模板见 contract §2.2 `export.md` 部分

### 5.13 启动浏览器

- 仅当 `frontend/dist/index.html` 存在时，`__main__.py` 在独立 daemon 线程中 `time.sleep(1.5)` 后 `webbrowser.open("http://127.0.0.1:29037")`，避免阻塞 uvicorn
- dev 模式（dist 不存在）静默跳过，开发者自己开 5173

### 5.14 静态文件挂载

- `bootstrap.create_app()` 内：`if (frontend_dist := repo_root / "frontend" / "dist").exists()`：
  - mount `/assets` → `dist/assets`
  - GET `/` → `dist/index.html`
  - GET `/{path:path}` → 若文件存在返回，否则返回 `dist/index.html`（SPA fallback）
- 前端 dist 不存在时，根路径返回 503（提示运行 `npm run build` 或 dev mode 用 5173）

---

## 6. 依赖

`pyproject.toml` 主依赖：

```
fastapi
uvicorn[standard]
sqlalchemy[asyncio]
aiosqlite
sounddevice
soundcard          # loopback 必需，不可用时降级
lameenc
numpy
dashscope          # 仅用于 ASR Realtime
openai             # LLM compatible-mode
pydantic
pydantic-settings
loguru
cryptography
```

dev 依赖：

```
pytest
pytest-asyncio
httpx              # 集成测试用
ruff
```

包管理：`uv`，提交 `uv.lock`。

---

## 7. 测试

| 层级 | 范围 | 工具 |
|---|---|---|
| 单元 | `QuestionDetector`（冷却/去重/置信度）、`AutoStop`（计时/tick）、`MP3Encoder`、Fernet 密钥、各 Repository 增删改查 | pytest + pytest-asyncio |
| 集成 | `SessionService`（用 fake ASR + fake LLM 跑完整 start → transcription → question → answer → stop 流程）、`ASRPipeline`（重连、轮换、force_commit 的触发条件）、`ChatService` | fakes 在 `tests/fakes/` |
| API | REST happy path（每个端点至少一个 case，httpx.AsyncClient）；WS handler round-trip（连接 → 发消息 → 收消息） | httpx + 测试 client |

不要写依赖真实网络的测试。dashscope / openai 全用 fake。

---

## 8. 任务清单（按依赖顺序）

### 8.1 脚手架

- [ ] 仓库根创建 `pyproject.toml`，依赖见 §6；`uv lock` 生成 `uv.lock`
- [ ] 删除旧 `requirements.txt`、`run.py`、`test_timer.py`
- [ ] 创建空目录骨架（含 `__init__.py`）

### 8.2 domain

- [ ] `domain/exceptions.py`
- [ ] `domain/ports.py`（`RealtimeASRPort`、`LLMPort`）

### 8.3 config & db

- [ ] `config.py`（pydantic-settings；`CC_DATA_DIR` / `CC_FORCE_IPV4` / 加密 key 路径；端口常量 29037）
- [ ] `db.py`（engine + session factory + `Base.metadata.create_all` + 数据目录初始化）
- [ ] `infrastructure/persistence/orm.py`
- [ ] `infrastructure/persistence/repositories.py`

### 8.4 infrastructure

- [ ] `infrastructure/crypto.py`
- [ ] `infrastructure/network.py`
- [ ] `infrastructure/llm/openai_compatible.py`
- [ ] `infrastructure/asr/qwen_omni.py`(保留 12 分钟轮换 + 前文上下文注入 + force_commit)
- [ ] `infrastructure/audio/encoder.py`
- [ ] `infrastructure/audio/capture.py`(mic + loopback;async context manager;丢帧计数)
- [ ] `infrastructure/audio/monitor.py`(10 Hz 节流推送)

### 8.5 application

- [ ] `application/settings.py`（`SettingsService` + `RuntimeSettings` dataclass）
- [ ] `application/question.py`（`QuestionDetector` + `AnswerGenerator`）
- [ ] `application/chat.py`
- [ ] `application/session.py`（`SessionService` + `ASRPipeline` + `AutoStop`）

### 8.6 api

- [ ] `api/schemas.py`（按 contract.md 写 Pydantic 模型，全部 snake_case）
- [ ] `api/ws/connection.py`（`ConnectionManager`）
- [ ] `api/ws/handlers.py`（按 contract §3.2 dispatch）
- [ ] `api/http/routes.py`（按 contract §2 实现所有路由）
- [ ] `api/http/error_handlers.py`

### 8.7 启动

- [ ] `logging.py`（loguru sink：控制台 + `data/logs/{app,error,asr,llm,ws}_{date}.log`，按 module bind 过滤）
- [ ] `bootstrap.py`：
  - `create_app()`：注册路由 + error handlers + 静态挂载（条件）
  - `lifespan()`：`create_all` → 初始化 `SettingsService`（加载 DB 设置）→ 装配 DI
- [ ] `__main__.py`：
  1. **第一行** `from class_copilot.infrastructure.network import apply_ipv4_only_patch; apply_ipv4_only_patch()`
  2. 配置 logging
  3. import bootstrap，create app
  4. 启动 uvicorn（`127.0.0.1:29037`，`log_level=warning`）
  5. dist 存在则 1.5s 后 `webbrowser.open`

### 8.8 测试

- [ ] `tests/fakes/asr.py`、`tests/fakes/llm.py`（fake ASR / fake LLM）
- [ ] §7 列的所有用例

### 8.9 收尾

- [ ] 端到端：用 dev 模式起 5173 之外的 mock 前端（curl + websocat 也行）跑通：建会话 → 录音 → 转写（用 fake ASR 触发）→ 检测 → 答案 → 主动提问 → 导出 → 定时停止 → 关闭
- [ ] 删除旧后端代码：`class_copilot/services/`、`routes/`、`app.py`、`database.py`、`logger.py`、`network_patch.py`、旧 `config.py`、`models/`
  - **注意：旧 `class_copilot/frontend/` 目录由前端阶段（Claude）接手时再删，后端阶段保留以保证旧 UI 暂时可用**
- [ ] 清空 `data/class_copilot.db*` 与 `data/recordings/`
- [ ] 更新 `README.md`：仅保留「快速开始 + DashScope API Key 申请」段落，删除豆包 / OSS / 精修 / 声纹 / 翻译 / 托盘 / 快捷键 / 通知所有章节
