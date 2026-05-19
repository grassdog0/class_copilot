# 前后端契约（Single Source of Truth）

> 后端（GPT 实现）和前端（Claude 实现）都必须严格遵守本文件。任何字段名、URL、消息格式、错误码不一致都视为 bug。
> 如果实施过程中发现契约不合理，**先改本文件**再改代码，不要单方面偏离。

---

## 1. 通信基础

| 项 | 值 |
|---|---|
| HTTP / WebSocket Host | `127.0.0.1` |
| 端口 | `29037` |
| REST 前缀 | `/api` |
| WebSocket 路径 | `/ws` |
| 静态前端 | 生产模式下 `/` 服务 `frontend/dist/index.html` |
| 字段命名 | **snake_case**（前后端一致，不做转换） |
| 时间字段编码 | ISO 8601 字符串，UTC，含 `Z` 后缀，例：`2026-05-19T08:30:00Z` |
| 时间区间字段（转写片段） | epoch 秒（float，毫秒精度） |
| 字符编码 | UTF-8 |
| 请求 / 响应体 | JSON |

前端展示时间时本地时区由前端转换；API 一律 UTC。

---

## 2. REST API

所有路由前缀 `/api`。除明确标注外，请求与响应均为 JSON。

### 2.1 课程 (Courses)

#### `GET /api/courses`

返回所有课程，按 `updated_at` 倒序。

**响应**：
```json
[
  {
    "id": "uuid-string",
    "name": "线性代数",
    "created_at": "2026-05-19T08:30:00Z",
    "updated_at": "2026-05-19T08:30:00Z"
  }
]
```

#### `POST /api/courses`

**请求**：
```json
{ "name": "线性代数" }
```

**响应**（201）：
```json
{
  "id": "uuid-string",
  "name": "线性代数",
  "created_at": "...",
  "updated_at": "..."
}
```

**错误**：
- 400 `name` 空 → `{"detail": "name is required"}`
- 409 同名已存在 → `{"detail": "course already exists"}`

#### `PATCH /api/courses/{course_id}`

**请求**：
```json
{ "name": "新名字" }
```

**响应**（200）：完整 course 对象。

**错误**：
- 404 不存在
- 409 重名

#### `DELETE /api/courses/{course_id}`

**响应**（204）：空 body。

**错误**：
- 404 不存在
- 409 课程下还有会话 → `{"detail": "course has sessions, cannot delete"}`

---

### 2.2 会话 (Sessions)

#### `GET /api/sessions`

可选查询参数：`date_from=YYYY-MM-DD`、`date_to=YYYY-MM-DD`、`course_id=uuid`。
按 `started_at` 倒序。

**响应**：
```json
[
  {
    "id": "uuid",
    "course_id": "uuid",
    "course_name": "线性代数",
    "custom_name": null,
    "date": "2026-05-19",
    "started_at": "2026-05-19T08:30:00Z",
    "ended_at": "2026-05-19T10:00:00Z",
    "status": "stopped"
  }
]
```

`status` 取值：`active` / `stopped` / `interrupted`。

#### `GET /api/sessions/{session_id}`

**响应**：
```json
{
  "session": {
    "id": "uuid",
    "course_id": "uuid",
    "course_name": "线性代数",
    "custom_name": null,
    "date": "2026-05-19",
    "started_at": "...",
    "ended_at": "...",
    "status": "stopped",
    "recording_path": "data/recordings/uuid.mp3",
    "recording_duration_seconds": 5400.0,
    "recording_file_size_bytes": 86400000
  },
  "transcriptions": [
    {
      "id": "uuid",
      "sequence": 1,
      "start_time": 1747640400.123,
      "end_time": 1747640405.456,
      "text": "今天我们讲...",
      "is_final": true,
      "created_at": "..."
    }
  ],
  "questions": [
    {
      "id": "uuid",
      "question_text": "什么是向量空间？",
      "source": "auto",
      "confidence": 0.85,
      "context_text": "...",
      "created_at": "...",
      "answers": [
        {
          "id": "uuid",
          "answer_type": "brief",
          "content": "向量空间是...",
          "created_at": "...",
          "updated_at": "..."
        }
      ]
    }
  ],
  "chat_messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "再解释一下",
      "model_used": null,
      "created_at": "..."
    }
  ]
}
```

`source` 取值：`auto` / `manual`。
`answer_type` 取值：`brief` / `detailed`。
`role` 取值：`user` / `assistant`。

#### `PATCH /api/sessions/{session_id}`

修改 `custom_name`（其他字段只读）。

**请求**：
```json
{ "custom_name": "考试复盘" }
```

**响应**：完整 session 对象（同 list 格式）。

#### `DELETE /api/sessions/{session_id}`

级联删除转写、问题、答案、聊天 + 删除录音文件。
**响应**（204）：空。

#### `GET /api/sessions/{session_id}/export.md`

**响应**：`text/markdown; charset=utf-8`。
`Content-Disposition: attachment; filename="{date}_{course_name_or_session_id}.md"`。

Markdown 模板：

```markdown
# {custom_name 或 course_name} - {date}

开始：{started_at 本地时区}
结束：{ended_at 本地时区}

## 转写

{每条 text 一行，按 sequence 排序}

## 问题与答案

### {question_text}（{source}）

{answer.content}（仅展示当前 auto_answer_type 对应的 answer）

## 主动提问

**Q:** {chat user content}

**A:** {chat assistant content}
```

#### `GET /api/sessions/{session_id}/recording`

返回 MP3 文件流，`Content-Type: audio/mpeg`，`Content-Disposition: attachment; filename="{date}_{course_name}.mp3"`。

**错误**：
- 404 文件不存在

---

### 2.3 设置 (Settings)

#### `GET /api/settings`

返回所有运行时设置。加密字段（如 API key）返回脱敏值（前 4 字符 + `****`）。

**响应**：
```json
{
  "dashscope_api_key": "sk-a****",
  "dashscope_api_key_set": true,
  "language": "zh",
  "auto_answer_type": "brief",
  "asr_model": "qwen3.5-omni-flash-realtime",
  "chat_model_default": "qwen3.5-plus",
  "chat_model_fast": "qwen3.5-flash",
  "vad_threshold": 0.3,
  "vad_prefix_padding_ms": 500,
  "vad_silence_duration_ms": 1500,
  "asr_session_rotate_minutes": 12.0,
  "vad_max_segment_seconds": 30.0,
  "question_confidence_threshold": 0.7,
  "question_cooldown_seconds": 15,
  "question_similarity_threshold": 0.8,
  "audio_source": "microphone",
  "audio_device_id": null
}
```

`language` 枚举：`zh` / `en`。
`auto_answer_type` 枚举：`brief` / `detailed`。
`asr_model` 枚举：`qwen3.5-omni-flash-realtime` / `qwen3.5-omni-plus-realtime`。
`chat_model_default` / `chat_model_fast`：字符串，默认 `qwen3.5-plus` / `qwen3.5-flash`，前端不提供下拉，作为高级配置由用户手动改。
`audio_source` 枚举：`microphone` / `loopback`。
`audio_device_id`：麦克风时为 `int | null`，回环时为 `string | null`。

默认值（首次启动）：
- `language`: `"zh"`
- `auto_answer_type`: `"brief"`
- `asr_model`: `"qwen3.5-omni-flash-realtime"`
- `chat_model_default`: `"qwen3.5-plus"`
- `chat_model_fast`: `"qwen3.5-flash"`
- `vad_threshold`: `0.3`
- `vad_prefix_padding_ms`: `500`
- `vad_silence_duration_ms`: `1500`
- `asr_session_rotate_minutes`: `12.0`
- `vad_max_segment_seconds`: `30.0`
- `question_confidence_threshold`: `0.7`
- `question_cooldown_seconds`: `15`
- `question_similarity_threshold`: `0.8`
- `audio_source`: `"microphone"`
- `audio_device_id`: `null`

#### `PATCH /api/settings`

部分更新。请求体只包含要改的字段。

**请求**示例：
```json
{
  "dashscope_api_key": "sk-xxxx",
  "language": "en"
}
```

**响应**：完整 settings（同 GET 格式）。

变更后内存值立即生效；正在进行的 ASR 会话不会被重启，下次会话才采用新 VAD 参数。

---

### 2.4 音频 (Audio)

#### `GET /api/audio/devices`

**响应**：
```json
{
  "microphone": {
    "devices": [
      {
        "index": 1,
        "name": "Microphone (Realtek)",
        "channels": 1,
        "sample_rate": 16000,
        "is_default": true
      }
    ],
    "current_index": null
  },
  "loopback": {
    "available": true,
    "devices": [
      {
        "id": "speaker-id-string",
        "name": "Speakers (Realtek)",
        "is_default": true
      }
    ],
    "current_id": null
  },
  "audio_source": "microphone"
}
```

字段含义：
- `audio_source`：当前 settings 里的音源选择（`microphone` / `loopback`）
- `microphone.current_index`：当 `audio_source="microphone"` 时，settings 里保存的 `audio_device_id`；其他情况为 `null`
- `loopback.current_id`：当 `audio_source="loopback"` 时，settings 里保存的 `audio_device_id`；其他情况为 `null`
- `loopback.available`：`false` 时表示 `soundcard` 不可用，前端隐藏回环选项

#### `POST /api/audio/mic-monitor/start`

启动麦克风电平监控。电平数据通过 WS `mic_level` 事件推送。
**响应**（200）：`{"status": "started" | "already_monitoring"}`。

**错误**：
- 400 设备不可用 → `{"detail": "audio device unavailable: <reason>"}`

#### `POST /api/audio/mic-monitor/stop`

**响应**（200）：`{"status": "stopped"}`。

---

### 2.5 错误响应格式

所有错误统一：

```json
{ "detail": "错误描述（中文，给用户看）" }
```

HTTP 状态码：
- 400：请求参数错误 / 配置缺失
- 404：资源不存在
- 409：业务冲突（重名、有依赖等）
- 500：服务端意外错误

---

## 3. WebSocket 协议

### 3.1 通用格式

**所有消息**（双向）：
```json
{ "type": "字符串", "data": { ... } }
```

`type` 是消息类型字符串，`data` 是该类型对应的对象。`data` 永远是 object，即便为空也是 `{}`。

### 3.2 客户端 → 服务端

| type | data | 说明 |
|---|---|---|
| `start_listening` | `{ "course_id": "uuid", "auto_stop_seconds": 0, "auto_stop_label": "" }` | 开始监听。`course_id` 必填。`auto_stop_seconds=0` 表示不自动停止。 |
| `stop_listening` | `{}` | 停止当前会话 |
| `manual_detect` | `{}` | 手动触发问题检测 |
| `chat` | `{ "question": "字符串", "model": "fast" \| "quality" \| null }` | 主动向 AI 提问；`model="fast"` 用 `chat_model_fast`，`model="quality"` 或 `null` 用 `chat_model_default` |
| `update_auto_stop` | `{ "seconds": 600, "label": "10:30" }` | 运行时调整定时停止；`seconds=0` 取消 |

### 3.3 服务端 → 客户端

#### 连接事件

`type=status`：连接建立或状态变化时推送

```json
{
  "type": "status",
  "data": {
    "status": "ready" | "listening" | "stopped" | "error",
    "session_id": "uuid" | null,
    "course_id": "uuid" | null,
    "course_name": "字符串" | null,
    "is_listening": false,
    "auto_stop_remaining": 0
  }
}
```

#### 转写

```json
{
  "type": "transcription",
  "data": {
    "session_id": "uuid",
    "text": "今天我们讲...",
    "is_final": true,
    "start_time": 1747640400.123,
    "end_time": 1747640405.456,
    "sequence": 1
  }
}
```

interim 结果 `is_final=false`、`sequence=0`，前端可用同一区域局部更新；final 结果 `is_final=true` 才追加到列表。

#### 问题检测

```json
{
  "type": "question_detected",
  "data": {
    "question_id": "uuid",
    "question_text": "什么是向量空间？",
    "source": "auto" | "manual",
    "confidence": 0.85,
    "context_text": "..."
  }
}
```

#### 答案流

```json
{
  "type": "answer_generating",
  "data": {
    "question_id": "uuid",
    "answer_type": "brief" | "detailed"
  }
}
```

```json
{
  "type": "answer_chunk",
  "data": {
    "question_id": "uuid",
    "answer_type": "brief" | "detailed",
    "chunk": "增量文本",
    "full_text": "累积文本"
  }
}
```

```json
{
  "type": "answer_complete",
  "data": {
    "question_id": "uuid",
    "answer_type": "brief" | "detailed",
    "content": "完整文本"
  }
}
```

只生成一档（由 `auto_answer_type` 设置决定）。

#### 主动提问流

```json
{ "type": "chat_chunk", "data": { "chunk": "...", "full_text": "..." } }
```

```json
{ "type": "chat_complete", "data": { "content": "...", "model_used": "qwen3.5-plus" } }
```

#### 麦克风电平

```json
{
  "type": "mic_level",
  "data": {
    "db": -23.4,
    "peak": 0.8123,
    "clipping": false
  }
}
```

服务端节流到约 10 Hz。

#### 定时停止

```json
{ "type": "auto_stop_tick", "data": { "remaining": 30 } }
```

最后 60 秒每秒推一次，之前每 10 秒推一次。`remaining=0` 时表示已触发停止（再随后会跟一条 `status` `stopped`）。

#### 通知（用户可见的提示）

```json
{
  "type": "notification",
  "data": {
    "level": "info" | "warning" | "error",
    "message": "ASR 已自动重连"
  }
}
```

适用场景：自动重连成功 / 失败、ASR 会话轮换、临近自动停止、ASR 鉴权失败、音频设备不可用等。

#### 错误事件

```json
{ "type": "error", "data": { "code": "asr_permanent", "message": "API Key 无效，请检查配置" } }
```

`code` 枚举（前端可用于路由到设置页等）：
- `asr_permanent`：ASR 不可恢复（401 / 403 / 内容审查）
- `asr_unavailable`：ASR 连接失败且重试用尽
- `audio_device`：音频设备不可用
- `config_missing`：必要配置（如 API key）未设置

---

## 4. 业务规则（前后端必须一致理解）

### 4.1 监听生命周期

1. 用户在主页选课程 → 前端 WS 发 `start_listening`
2. 后端创建 session（status=`active`）→ 启动录音 + ASR → 推 `status` 事件（`listening`）
3. 转写流持续推送 `transcription` 事件
4. 检测到问题推送 `question_detected` + 启动 `answer_*` 流
5. 用户停止：前端发 `stop_listening` → 后端关闭录音 ASR → 更新 session（status=`stopped`）→ 推 `status` 事件（`stopped`）

### 4.2 异常路径

- ASR 鉴权失败：后端推 `notification` (error) + `error` (`asr_permanent`) + 自动停止会话（status=`interrupted`）
- ASR 中途断线：后端尝试 1 次重连。
  - 成功：推 `notification` (info) `"ASR 已自动重连"`
  - 失败：推 `notification` (error) + `error` (`asr_unavailable`) + 自动停止
- 应用异常退出：下次启动时所有 status=`active` 的 session 标记为 `interrupted`
- 麦克风启动失败：HTTP 路由（开始监听走 WS，但若用 mic-monitor 走 HTTP）返回 400；WS 路径下推 `error` (`audio_device`)

### 4.3 答案生成

- 一个 question 只生成一档答案（由 `auto_answer_type` 决定 brief / detailed）
- 用户在主页用 chat 输入框提问 → 进 `chat_messages` 表，**不进 `questions` 表**
- 自动检测出来的问题进 `questions` 表（source=`auto`）；前端「手动检测」按钮走 `manual_detect`，检测到的问题 source=`manual`

### 4.4 设置生效

- API key 变更：立即生效（下次 LLM 调用使用新 key）
- VAD / 轮换 / 置信度等参数：仅下次会话生效；UI 提示「下次会话生效」
- 音频设备 / 音源：仅下次会话生效
- ASR 模型 (`asr_model`)：仅下次会话生效

### 4.5 课程删除

- 课程下没有会话才能删；有会话返回 409。前端要先提示用户先删会话或换课程。

---

## 5. 前端可调用顺序示例

```
GET /api/settings           # 加载设置
GET /api/courses            # 加载课程
GET /api/audio/devices      # 加载设备
WS  /ws                     # 连接，立即收到首条 status

POST /api/audio/mic-monitor/start    # 设置页测麦克风
WS receive type=mic_level (10 Hz)
POST /api/audio/mic-monitor/stop

WS send  type=start_listening { course_id, auto_stop_seconds }
WS receive type=status (listening)
WS receive type=transcription (流)
WS receive type=question_detected → answer_generating → answer_chunk * N → answer_complete
WS send  type=chat { question }
WS receive type=chat_chunk * N → chat_complete
WS send  type=stop_listening
WS receive type=status (stopped)

GET /api/sessions
GET /api/sessions/{id}
GET /api/sessions/{id}/export.md
```
