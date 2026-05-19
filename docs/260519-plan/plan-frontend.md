# 前端重构计划（Claude 执行）

> 配套文档：`plan.md`（项目背景与共同约束）、`contract.md`（前后端契约）、`plan-backend.md`（后端实现，已完成）。
> **本文件中关于 API / WS 的任何字段、格式约定，以 `contract.md` 为准。如果发现 contract 与后端 OpenAPI（`http://127.0.0.1:29037/docs`）不一致，先反馈，不要默默偏离。**

---

## 1. 范围

实现 `frontend/` 目录下的单页应用，提供：

- 监听主页：选课程、开始/停止录制、麦克风电平、转写流、问题列表、答案展示、主动提问输入框、定时停止控件
- 历史会话：列表（按本地日期分组）+ 详情 + 导出
- 设置：API Key、答案档位、language、VAD 参数、置信度阈值、音频设备
- 课程的内联管理（新建 / 编辑 / 删除），不设独立页面

**不包含**：后端代码（已由 GPT 完成）。后端假设已经按 `contract.md` 实现完毕并跑在 `http://127.0.0.1:29037`。

---

## 2. 技术选型

- Vite + React 18 + TypeScript（严格模式）
- 路由：React Router v6
- 状态：Zustand（按域拆 store，避免单一巨型 store）
- UI：Tailwind CSS + shadcn/ui（基于 Radix）
- Markdown 渲染：`react-markdown` + `remark-gfm`
- 时间：`date-fns`（按本地时区展示，UTC 解析）
- HTTP：`fetch` 封装；不引入 axios
- WebSocket：原生 `WebSocket`，自定义 hook + 自动重连
- 包管理：`npm`，提交 `package-lock.json`

不引入：Redux、tRPC、TanStack Query（手写 fetch 已足够）、Storybook、E2E 测试框架。

---

## 3. 目录结构

```
frontend/
├── public/                    # 仅放 favicon 等不需构建的静态文件
├── src/
│   ├── api/
│   │   ├── client.ts          # fetch 封装（统一前缀 /api、错误处理、JSON）
│   │   ├── courses.ts
│   │   ├── sessions.ts
│   │   ├── settings.ts
│   │   ├── audio.ts
│   │   └── types.ts           # 与 contract.md §2 一一对应的 TS 类型
│   ├── ws/
│   │   ├── client.ts          # WebSocket 单例 + 连接管理 + 重连
│   │   ├── messages.ts        # 与 contract.md §3 一一对应的入站/出站类型
│   │   └── useWebSocket.ts    # React hook：订阅事件 + 发送消息
│   ├── stores/
│   │   ├── session.ts         # 当前会话状态（status/auto_stop_remaining 等）
│   │   ├── transcripts.ts     # 当前会话的转写流（含 interim 缓冲）
│   │   ├── questions.ts       # 当前会话的问题 + 答案
│   │   ├── chat.ts            # 主动提问 + 当前流
│   │   ├── settings.ts        # 全局设置（runtime settings 镜像）
│   │   ├── courses.ts         # 课程列表
│   │   └── ui.ts              # 通知 toast 队列、模态框开关等
│   ├── pages/
│   │   ├── HomePage.tsx       # 监听主页（"/"）
│   │   ├── SessionsPage.tsx   # 历史会话列表（"/sessions"）
│   │   ├── SessionDetailPage.tsx  # "/sessions/:id"
│   │   └── SettingsPage.tsx   # "/settings"
│   ├── components/
│   │   ├── home/
│   │   │   ├── CourseSelect.tsx    # 含「新建课程」inline
│   │   │   ├── ListenControls.tsx  # start/stop + 定时停止
│   │   │   ├── MicLevelMeter.tsx
│   │   │   ├── TranscriptStream.tsx
│   │   │   ├── QuestionList.tsx
│   │   │   ├── AnswerCard.tsx
│   │   │   └── ChatPanel.tsx
│   │   ├── sessions/
│   │   │   └── SessionListGrouped.tsx
│   │   ├── settings/
│   │   │   ├── ApiKeySection.tsx
│   │   │   ├── AsrParamsSection.tsx
│   │   │   ├── QuestionParamsSection.tsx
│   │   │   ├── AudioSection.tsx       # 设备列表 + 测麦克风
│   │   │   └── CourseManageSection.tsx  # 编辑/删除课程
│   │   ├── ui/                # shadcn 注入的组件
│   │   ├── Toast.tsx          # 监听 ws notification + 显示
│   │   └── AppLayout.tsx
│   ├── hooks/
│   │   ├── useMicMonitor.ts
│   │   └── useAutoStop.ts
│   ├── lib/
│   │   ├── time.ts            # ISO UTC ↔ 本地展示
│   │   └── format.ts          # 时长 / 文件大小等
│   ├── App.tsx                # 路由 + 全局 layout
│   ├── main.tsx               # 入口
│   └── index.css              # tailwind base
├── index.html
├── vite.config.ts             # 代理 /api 与 /ws 到 127.0.0.1:29037
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── package.json
└── package-lock.json
```

构建产物：`frontend/dist/`，由后端 FastAPI 在生产模式下挂载。开发模式 Vite 默认 5173，由 `vite.config.ts` 代理到后端。

---

## 4. 类型与契约同步

`src/api/types.ts` 与 `src/ws/messages.ts` 是 `contract.md` 的 TypeScript 镜像。

约定：

- 字段名 **snake_case**，与契约一致；不在前端做命名转换
- 时间戳字符串字段类型 `string`（ISO 8601 UTC），用 `date-fns/parseISO` 解析后转本地时区展示
- 时间区间字段（`start_time` / `end_time`）类型 `number`（epoch float），毫秒精度
- 所有枚举用字面量联合：`"auto" | "manual"` / `"brief" | "detailed"` / `"active" | "stopped" | "interrupted"` 等
- API 错误响应 `{ detail: string }`，client.ts 统一抛 `ApiError(detail, status)`

实现完后开发期联调时，遇到契约不符要先**反馈到 contract.md**（与后端方对齐），再调代码。

---

## 5. WebSocket 设计

### 5.1 客户端封装

`src/ws/client.ts`：

```ts
class WSClient {
  connect(): void
  disconnect(): void
  send<T extends OutboundMessageType>(type: T, data: OutboundData[T]): void
  on<T extends InboundMessageType>(type: T, handler: (data: InboundData[T]) => void): () => void  // 返回 unsubscribe
  // 内部：自动重连（指数退避，最多 1s/2s/5s/10s/30s）；连接状态变化通过 onStateChange 暴露
}
```

- 应用启动后立刻 `connect()`，全局单例
- 路由切换不重连
- 连接 / 断开状态在 `ui` store 反映，全局可看到「服务器已断开」横幅

### 5.2 useWebSocket hook

```ts
function useWsEvent<T extends InboundMessageType>(type: T, handler: (data: InboundData[T]) => void): void
function useWsSend(): <T extends OutboundMessageType>(type: T, data: OutboundData[T]) => void
```

页面 / 组件订阅事件，自动 cleanup。

### 5.3 事件分发到 store

由顶层 `App.tsx` 用 `useWsEvent` 把每个事件喂给对应 store：

| WS 事件 | 落点 |
|---|---|
| `status` | `session` store |
| `transcription` | `transcripts` store（interim 替换最后一条 interim，final 追加） |
| `question_detected` | `questions` store |
| `answer_generating` / `answer_chunk` / `answer_complete` | `questions` store |
| `chat_chunk` / `chat_complete` | `chat` store |
| `mic_level` | `useMicMonitor` 内部状态（不进 store） |
| `auto_stop_tick` | `session` store + 最后 60s 时显眼提示 |
| `notification` | `ui` store toast 队列 |
| `error` | `ui` store toast（红色），并按 `code` 路由（如 `config_missing` → 跳转 `/settings`） |

---

## 6. 页面与交互

### 6.1 监听主页 `/`

布局（建议三栏 / 上下分块）：

- 顶部：`CourseSelect`（下拉 + 「+ 新建」按钮触发 inline 输入框）+ `ListenControls`（开始/停止、定时停止下拉）+ 当前状态徽章（ready/listening/stopped/error）
- 左上：`MicLevelMeter`（条形图 + 当前 dBFS + 削波警告）
- 中区：`TranscriptStream`（虚拟滚动列表；interim 行高亮显示并跟随）
- 右上：`QuestionList`（按时间倒序，最新的在上）
- 选中问题展开 `AnswerCard`（流式 token-by-token 渲染；Markdown）
- 底部：`ChatPanel`（输入框 + 发送 + 流式返回区域）
  - 输入框旁有「fast / quality」切换（默认 quality），发送时通过 WS `chat` 消息的 `model` 字段传 `"fast"` / `"quality"` / `null`

行为：

- 没填 API key 时，「开始监听」按钮禁用 + 提示「先去设置页填 DashScope API Key」+ 链接到 `/settings`
- 选课程时如果列表为空，显示「先新建一个课程」+ inline 输入框
- 定时停止：下拉选项 30/60/90 分钟 + 自定义；运行时调整通过 WS `update_auto_stop`
- `auto_stop_tick.remaining <= 30` 时主页显眼倒计时
- WS `error` (code=`asr_permanent`) 时弹模态框「ASR 鉴权失败」+ 「去设置」按钮

### 6.2 历史会话 `/sessions`

- 按 `started_at` 的本地日期 group by，分组标题 `2026-05-19 周二`
- 每条卡片：课程名 / 自定义名 / 起止时间 / 状态徽章
- 操作：点击进入详情；右上 ⋯ 菜单：重命名（弹模态框）、删除（确认对话框）

### 6.3 会话详情 `/sessions/:id`

- 顶部：基本信息 + 「导出 Markdown」按钮（`window.location = /api/sessions/:id/export.md`）+ 「下载录音」（`/api/sessions/:id/recording`）
- 标签页：`转写` / `问题与答案` / `主动提问`
- 转写：纯展示，长文本支持 ctrl+F 搜索
- 问题与答案：展开收起；只展示当前 `auto_answer_type` 对应的答案档位
- 主动提问：user / assistant 对话气泡

### 6.4 设置 `/settings`

按 section：

- **API Key**：`ApiKeySection`。读取时显示脱敏值；编辑时切「修改」按钮 → 输入框 → 保存（PATCH）
- **模型**：单选实时 ASR 模型（`qwen3.5-omni-flash-realtime` / `qwen3.5-omni-plus-realtime`）。`chat_model_default` / `chat_model_fast` 暂不暴露（高级用户可直接编辑 settings 表，前端不做 UI）
- **答案档位**：单选 brief / detailed
- **语言**：单选 zh / en
- **ASR 参数**：`AsrParamsSection`。VAD threshold (0-1 滑块) / prefix padding ms / silence duration ms / rotate minutes / max segment seconds。提示「下次会话生效」
- **问题检测**：confidence threshold / cooldown seconds / similarity threshold
- **音频设备**：`AudioSection`。来源（麦克风 / 系统回环）单选；下拉选具体设备；「测试麦克风」按钮启动 mic-monitor 显示 5s 电平条
- **课程管理**：`CourseManageSection`。表格列出所有课程（名称、创建时间、操作）；编辑名称、删除（有会话时禁用并提示）

所有设置项 onChange debounce 500ms 后 `PATCH /api/settings`。失败 toast 错误 + 回滚本地状态。

---

## 7. 视觉设计要点

旧前端被用户嫌弃，新版要现代 + 干净：

- 整体配色：浅色背景 + 中性灰文字；强调色用 Tailwind `indigo-600` 一种就够；夜间模式可选（默认浅色）
- 字体：系统 UI sans + 等宽（转写文本用等宽更易扫读）
- 间距：Tailwind `space-y-4` / `gap-4` 起步，避免内容贴边
- 卡片：白底 + `border-slate-200` + `rounded-lg` + 适度阴影
- 按钮：shadcn 默认（primary / secondary / ghost / destructive）
- 图标：`lucide-react`
- 动画：进入 / 离开用 Tailwind `transition` 即可，不引入 framer-motion
- 数据密度：转写流默认 24 行屏幕显示；问题列表卡片紧凑；详情页可呼吸

可访问性基线：

- 所有交互元素有可见焦点环
- 颜色对比度 ≥ AA
- WS 状态横幅、toast 用 `role=alert`

---

## 8. 开发与构建

### 8.1 vite.config.ts

```ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:29037",
      "/ws": { target: "ws://127.0.0.1:29037", ws: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
```

### 8.2 开发流程

1. 后端跑 `python -m class_copilot`（监听 29037）
2. 前端跑 `npm run dev`（5173），Vite 代理 API/WS 到后端
3. 调好后 `npm run build` 生成 `dist/`，重启后端即可在 `http://127.0.0.1:29037` 访问生产构建

### 8.3 联调清单

照下面顺序逐项过：

- [ ] WS 连上后立刻收到 `status`，前端正确反映 ready/listening
- [ ] 选课程 + 开始监听 → 后端进入 listening → 前端按钮变「停止」
- [ ] 录音 5s 看到 transcription 事件流入；interim 与 final 行为正确
- [ ] 触发 manual_detect 看到 question_detected
- [ ] 答案 chunk 流式渲染正常，complete 后能完整看到
- [ ] chat 消息往返
- [ ] auto_stop_tick 倒计时显示；最后 30s 警告
- [ ] 改 API key 后立即生效（重启监听后能成功）
- [ ] 删除有会话的课程返回 409，前端正确弹错
- [ ] 导出 Markdown 文件下载正常
- [ ] 重启后端，前端 WS 自动重连成功

---

## 9. 任务清单（按依赖顺序）

### 9.1 脚手架

- [ ] 删除旧 `class_copilot/frontend/` 目录
- [ ] 在仓库根用 `npm create vite@latest frontend -- --template react-ts` 创建新 `frontend/`
- [ ] `cd frontend`，`npm install`
- [ ] 安装运行时依赖：`npm install react-router-dom zustand react-markdown remark-gfm date-fns lucide-react`
- [ ] 安装 dev 依赖：`npm install -D tailwindcss postcss autoprefixer`，`npx tailwindcss init -p`
- [ ] 集成 shadcn/ui（`npx shadcn@latest init`）；按需安装组件
- [ ] `vite.config.ts` 配代理；`tsconfig.json` 开严格模式（`"strict": true`）

### 9.2 类型与基础设施

- [ ] `src/api/types.ts`（按 contract §2 镜像）
- [ ] `src/ws/messages.ts`（按 contract §3 镜像）
- [ ] `src/api/client.ts`（fetch 封装）
- [ ] `src/api/{courses,sessions,settings,audio}.ts`
- [ ] `src/ws/client.ts`（WSClient 单例 + 重连）
- [ ] `src/ws/useWebSocket.ts`（订阅 hook）

### 9.3 Stores

- [ ] `src/stores/{session,transcripts,questions,chat,settings,courses,ui}.ts`

### 9.4 布局与全局

- [ ] `src/App.tsx`：BrowserRouter + AppLayout + WS 事件分发到 store
- [ ] `src/components/AppLayout.tsx`：顶部导航（首页 / 会话 / 设置）+ 主区
- [ ] `src/components/Toast.tsx`：订阅 ui store toast 队列
- [ ] `src/index.css` + `tailwind.config.ts`

### 9.5 监听主页

- [ ] `CourseSelect`（含 inline 新建）
- [ ] `ListenControls`（开始/停止 + 定时停止下拉 + WS `update_auto_stop`）
- [ ] `MicLevelMeter`（订阅 mic_level）
- [ ] `TranscriptStream`（虚拟滚动可选；先用普通滚动）
- [ ] `QuestionList` + `AnswerCard`（流式 Markdown 渲染）
- [ ] `ChatPanel`（输入 + 流式返回）
- [ ] `HomePage`：组合上述组件 + 状态徽章

### 9.6 历史会话

- [ ] `SessionListGrouped`（按本地日期 group by）
- [ ] `SessionsPage`
- [ ] `SessionDetailPage`（标签页布局）

### 9.7 设置

- [ ] `ApiKeySection`、`AsrParamsSection`、`QuestionParamsSection`、`AudioSection`、`CourseManageSection`
- [ ] `SettingsPage`：组合上述 section
- [ ] 所有改动 debounce 500ms 自动保存

### 9.8 联调

- [ ] 按 §8.3 清单逐项验证
- [ ] 回归：旧后端用历史数据库会怎样？（应当不会，因为后端要求清空旧库；但前端代码不应做"老字段兼容"）

### 9.9 收尾

- [ ] `npm run build` 产出干净的 `dist/`
- [ ] 检查后端 `bootstrap.py` 静态挂载逻辑，确保生产模式下 `/` 能正常返回
- [ ] 更新仓库根 `README.md`：补充「前端开发」段（`cd frontend && npm install && npm run dev`）

---

## 10. 不做的事

- 国际化（i18n）：界面只做中文
- 暗色模式：可后续加，本期跳过
- 移动端适配：本期只面向桌面浏览器，最低分辨率 1280×720
- 离线模式 / PWA
- 用户系统 / 权限
- 自动化测试：本期前端不写单测；通过 §8.3 联调清单做手工验证
