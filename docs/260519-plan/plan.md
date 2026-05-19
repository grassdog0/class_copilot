# 听课助手 (Class Copilot) 重构计划 — 索引

## 文档结构

| 文件 | 内容 | 给谁看 |
|---|---|---|
| `plan.md` | 项目背景、目标、共同约束、文档导航（本文件） | 所有人 |
| `contract.md` | 前后端契约：REST / WS / 字段命名 / 错误码 | 后端 + 前端 + 联调 |
| `plan-backend.md` | 后端目录结构、模块设计、任务清单 | GPT |
| `plan-frontend.md` | 前端目录结构、组件设计、任务清单 | Claude（在后端完成后） |
| `reference/` | 阿里云百炼 API 参考（模型列表 / 计费 / 实时全模态 / 文本生成 / 深度思考 / 上下文缓存等） | 按需查阅 |

**任何 API / WS 字段、消息格式、URL、错误码的歧义，以 `contract.md` 为准。** 子 plan 与 contract 冲突时，先改 contract，再改子 plan，最后写代码。

---

## 项目背景

听课助手（Class Copilot）：本地运行的桌面端工具，帮大学生在听课时实时获取语音转写、识别教师提问并自动给出参考答案。

旧实现是早期 LLM 生成的代码，存在严重质量问题（上帝类、字段语义重载、`except Exception: pass` 滥用、配置双轨制等），决定按本计划完整重写。

---

## 目标功能（重构后保留）

- 麦克风 / 系统回环录音，MP3 落盘
- 实时语音转写（仅 Qwen3.5-Omni-Realtime 一家）
  - 12 分钟会话轮换 + 前文上下文注入
  - 长时间无文本输出时强制提交 (`force_commit`)
  - 断线 1 次重连，仍失败则停止
- LLM 问题检测（去重 / 冷却 / 置信度过滤）
- LLM 答案生成（单档：brief / detailed 由设置决定，流式）
- LLM 主动提问 chat（流式）
- 多课程管理（增删改）
- 会话浏览 / 重命名 / 删除 / Markdown 导出
- API Key Fernet 加密存储
- 定时停止 + 最后 30 秒提示
- WebSocket 实时推送（转写、问题、答案块、状态、麦克风电平、auto-stop tick、通知、错误）
- DashScope 域名 IPv4-only 网络补丁
- 全新前端 SPA（Vite + React + TS + Tailwind + shadcn/ui）

---

## 已砍除的功能（不要重新引入）

- 豆包（火山引擎）ASR
- 所有精修能力（含 DashScope filetrans / Omni 精修 / OSS 上传）
- 声纹 / 说话人识别 / `is_teacher` / teacher_only 过滤
- 翻译 / 双语展示
- 系统托盘 / 全局快捷键 / Windows 通知
- 双答案并行（brief + detailed 同时生成）
- 主动提问的 think_mode
- 续记 (recall_session)
- ZIP 导出
- 课程热词

---

## 共同设计原则

1. **分层清晰**：domain（接口）/ infrastructure（实现）/ application（用例）/ api（HTTP + WS）
2. **接口替代鸭子类型**：禁止 `hasattr(...)` 之流
3. **配置单一来源**：一份配置不要两处存储；一个字段不要两种语义
4. **失败显式**：禁止 `except Exception: pass`；领域异常单独定义并向上抛
5. **关键逻辑可单测**：fake ASR + fake LLM 跑集成测试

---

## 模型选型

为兼顾性价比，**全部使用 Qwen3.5 系列，不用最新的 Qwen3.6（更贵）**。

| 用途 | 模型 | 备注 |
|---|---|---|
| 实时 ASR（默认） | `qwen3.5-omni-flash-realtime` | 高频、对延迟敏感，flash 性价比更优 |
| 实时 ASR（高质量可选） | `qwen3.5-omni-plus-realtime` | 用户在设置中可切换 |
| LLM 问题检测 | `qwen3.5-flash` | 低成本短上下文判断 |
| LLM 答案生成 | `qwen3.5-flash` | 单档（brief / detailed），频繁调用 |
| LLM 主动提问 chat（默认） | `qwen3.5-plus` | 上下文长、需要质量 |
| LLM 主动提问 chat（快速可选） | `qwen3.5-flash` | 用户在 chat 面板内可切换「fast / quality」，前端 UI 详见 plan-frontend §6.1 |

### 必须关闭深度思考

> Qwen3.5 系列商业版（`qwen3.5-plus` / `qwen3.5-flash`）**默认开启思考模式**，会导致响应延迟显著增加且 Token 消耗翻倍。本应用所有 LLM 调用都必须显式关闭思考。

具体做法（OpenAI 兼容接口）：

```python
client.chat.completions.create(
    model="qwen3.5-flash",
    messages=[...],
    extra_body={"enable_thinking": False},
    stream=True,
    stream_options={"include_usage": True},
)
```

详见 `reference/深度思考.md`。

实时 Omni 模型（`qwen3.5-omni-*-realtime`）走 WebSocket 接口，没有思考开关，无需处理。

---

## 共同固定值

| 项 | 值 |
|---|---|
| HTTP 端口 | `29037`（写死） |
| 默认数据目录 | `./data/`（可由 `CC_DATA_DIR` 覆盖） |
| 加密密钥文件 | `data/.encryption_key` |
| 录音目录 | `data/recordings/`，命名 `{session_id}.mp3` |
| 日志目录 | `data/logs/` |
| `force_ipv4` | 默认 `true`，可由 `CC_FORCE_IPV4=false` 关闭 |
| 字段命名 | snake_case（前后端统一） |
| 时间戳类字段 | ISO 8601 UTC，如 `2026-05-19T08:30:00Z` |
| 时间区间字段 | epoch float，毫秒精度 |
| MP3 编码 | 128 kbps、单声道、16000 Hz |

---

## 仓库结构总览

```
.
├── class_copilot/          # 后端 package（GPT 实现）
├── frontend/               # 前端 SPA（Claude 实现）
├── tests/                  # 后端测试（fakes 在 tests/fakes/）
├── data/                   # 运行时数据（.gitignore）
├── docs/
│   ├── 260519-plan/        # 本计划目录
│   │   ├── plan.md
│   │   ├── plan-backend.md
│   │   ├── plan-frontend.md
│   │   ├── contract.md
│   │   └── reference/
│   └── ...                 # 其他历史文档
├── pyproject.toml          # 后端依赖（uv 管理，提交 uv.lock）
├── README.md
└── .env.example
```

详细模块清单见各自 plan-*.md。

---

## 实施顺序

1. **后端先行**：GPT 按 `plan-backend.md` 实现 `class_copilot/` 后端代码
2. **后端验证**：跑通后端单元 + 集成测试；用 curl / websocat 验证 contract 是否被严格遵守
3. **前端启动**：把 `plan.md` + `contract.md` + `plan-frontend.md` + 实际跑起来的后端（`http://127.0.0.1:29037/docs` 自动文档）一起交给 Claude
4. **前端实现**：Claude 按 `plan-frontend.md` 实现 `frontend/` 目录
5. **联调**：按 `plan-frontend.md` §8.3 清单逐项验证
6. **收尾**：删除旧代码、清空旧数据、更新 README

---

## 测试边界

- **单元测试 + 集成测试（fake-based）**：仅后端要做，工具用 pytest + pytest-asyncio
- **前端测试**：本期不做，通过手工联调清单验证
- **E2E**：本期不做
- **属性测试**：不引入

---

## 不在范围内的事项

- 国际化（界面只做中文）
- 暗色模式 / 移动端适配 / PWA
- 多用户 / 鉴权
- 跨平台桌面打包（PyInstaller / Tauri 等）
- 切换数据库到 Postgres / MySQL
- 性能优化（除非现状明显不可用）
