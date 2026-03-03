# PhoenixPanel — Claude Code 分阶段执行 Prompts

> **使用说明**
> - 每个 Phase 是一次独立的 Claude Code 对话
> - 将对应的 Prompt 块完整粘贴给 Claude Code，让它自主完成
> - 每个 Phase 结束后，按"用户测试检查点"验收，通过后再进入下一 Phase
> - ⚠️ 标注的步骤需要你在 HPC 上亲自操作并将结果反馈给 Claude Code

> **Claude Code 自动读取的文件**
> - `CLAUDE.md` — 项目约束与只读白名单，Claude Code 启动时自动加载，无需手动粘贴
> - `PROGRESS.md` — 开发进度追踪，Claude Code 在**每个 Phase 完成后**自行更新状态和备注

---

## Phase 0 — 项目脚手架

**目标**：搭建 Electron + React 项目结构，确保 App 能启动并显示空白 Popover。

**前置条件**：Mac 上已安装 Node.js（≥ 18）和 npm。

---

### Prompt 0

```
你好，我需要你帮我从零搭建一个 macOS 菜单栏 App，叫 PhoenixPanel。
技术栈：Electron + React（TypeScript），macOS only。

请完成以下工作，全程自主执行，遇到选型问题自行决定最佳方案：

1. 用 `electron-vite` 脚手架初始化项目（比 CRA 更适合 Electron）：
   ```
   npm create electron-vite@latest phoenixpanel -- --template react-ts
   ```

2. 安装以下依赖：
   - `electron-store`：本地配置持久化
   - `keytar`：macOS Keychain 读写
   - `marked`：Markdown 渲染（后期用）
   - `node-ssh`：SSH 连接管理

3. 配置 `electron/main.ts`：
   - 创建系统托盘（Tray），图标使用临时占位图标（16x16 灰色方块即可）
   - 创建 BrowserWindow，设置为 Popover 风格：
     - `type: 'panel'`
     - `width: 400, height: 560`
     - `vibrancy: 'under-window'`
     - `visualEffectState: 'active'`
     - `transparent: true`
     - `frame: false`
     - `show: false`（初始隐藏）
   - 点击 Tray 图标时，将窗口定位在图标正下方并 show/hide 切换
   - 点击窗口外部区域时自动隐藏（blur 事件）

4. React 侧（`src/renderer`）：
   - 创建空白 App 组件，背景透明，显示文字 "PhoenixPanel 已启动" 居中
   - 使用 CSS 变量 `--system-font: -apple-system, BlinkMacSystemFont, sans-serif`

5. 配置 `package.json` scripts：
   - `dev`：启动开发模式（热重载）
   - `build`：打包 macOS .app

完成后告诉我运行 `npm run dev` 的方法，以及我应该看到什么现象。
最后将 PROGRESS.md 中 Phase 0 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。
```

---

### 用户测试检查点 0

- [ ] 运行 `npm run dev`，菜单栏出现图标
- [ ] 点击图标，弹出透明/毛玻璃背景的面板，显示"PhoenixPanel 已启动"
- [ ] 点击面板外部，面板消失
- [ ] Dark Mode 切换后，面板背景跟随变化

**不涉及 HPC，无安全风险。**

---

---

## Phase 1 — SSH 连接层

**目标**：建立可复用的 SSH 连接管理器，实现连接/断连检测，在 UI 显示连接状态。

---

### Prompt 1

```
PhoenixPanel 项目已完成脚手架搭建（Phase 0）。现在需要构建 SSH 连接层。

请阅读以下设计约束，然后自主实现：

【设计约束（重要）】
- App 永远不执行任何写操作或计算操作（sbatch/srun/python 等）
- SSH 只用于：squeue、quota、du、tail -f、cat 这类只读命令
- 所有 SSH 操作通过 Electron 主进程（main process）执行，渲染进程通过 IPC 请求

【需要实现的内容】

1. `electron/ssh-manager.ts` — SSH 连接管理器：
   - 使用 `node-ssh` 库
   - 连接参数从 `electron-store` 读取（host: 'kcl-hpc', username 从 ~/.ssh/config 解析）
   - 实现 `connect()`, `disconnect()`, `executeCommand(cmd: string): Promise<string>`
   - `executeCommand` 有白名单校验：只允许执行以 `squeue`、`quota`、`du`、`df`、`tail`、`cat`、`sacct` 开头的命令，其他命令一律拒绝并抛出错误（这是安全边界）
   - 使用 SSH ControlMaster 配置（参考 feature-spec.md M4 中的 SSH 配置）
   - 断线时每 30 秒重试，最多 5 次

2. `electron/ipc-handlers.ts` — IPC 通道定义：
   - `ssh:status` → 返回当前连接状态（connected / connecting / disconnected / error）
   - `ssh:test-connection` → 执行 `echo ok` 测试连通性并返回结果

3. React 侧，在 Popover Header 区域显示：
   - 绿色圆点 + "kcl-hpc"（已连接）
   - 橙色圆点 + "重连中…"（重连）
   - 红色圆点 + "未连接"（断连）
   - 使用 `useEffect` 每 5 秒轮询 `ssh:status`

4. 一个 `[刷新]` 按钮（SF Symbols: arrow.clockwise），点击后触发 `ssh:test-connection` 并更新状态

完成后，告诉我如何验证 SSH 连接是否正常工作（我会提供测试结果）。
最后将 PROGRESS.md 中 Phase 1 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。
```

---

### 用户测试检查点 1 ⚠️ HPC 相关

**操作步骤**：
1. 确保 Mac 已通过 Tailscale 连接到 KCL 网络
2. 在终端手动确认 `ssh kcl-hpc echo ok` 可以正常返回
3. 运行 `npm run dev`，观察 Popover Header 中的连接状态

**验证项目**：
- [ ] Header 显示绿色圆点 + "kcl-hpc"
- [ ] 关闭 Tailscale 后，Header 变为红色 "未连接"，恢复后自动重连
- [ ] 点击 `[刷新]` 按钮，状态即时更新
- [ ] 在 Claude Code 的终端中确认：故意输入一个非白名单命令（如 `sbatch test.sh`），应看到错误拒绝，**不会实际执行**

**安全确认**：⚠️ 本 Phase 不会向 HPC 提交任何 job，只做 `echo ok` 测试。你无需在 HPC 终端做任何操作。

---

---

## Phase 2 — Job 看板

**目标**：实现 squeue 轮询与解析，渲染 Job 状态卡片，实现"复制 scancel"功能。

---

### Prompt 2

```
PhoenixPanel 的 SSH 连接层已完成（Phase 1）。现在实现 Job 看板模块。

请参考以下规格自主实现，无需询问我前端实现细节：

【数据获取】
每 30 秒（可配置）通过 SSH 执行：
ssh kcl-hpc "squeue -u $USER --format='%i|%j|%T|%M|%P|%C|%b' --noheader"

IPC 通道：`jobs:get-all` → 返回解析后的 Job 对象数组

【⚠️ DDP 多卡作业的 GPU 数解析】
KCL HPC 上 DDP 作业（如 8×GPU）通过 --gres=gpu:N 分配，%b（TRES）字段格式不统一，必须做防御性解析：
- "gpu:8"                              → 简单格式
- "gres/gpu:8"                         → 标准 GRES 格式
- "gres/gpu:a100:8"                    → 含 GPU 型号
- "billing=8,cpu=32,gres/gpu:a100:8,mem=64G"  → 完整 TRES 字符串
- "N/A"                                → CPU only job

解析逻辑：优先正则 gres/gpu(?::[^:]+)?:(\d+)，其次 ^gpu:(\d+)，均不匹配则显示 "CPU only"。

Job 对象结构：
```typescript
interface Job {
  id: string;        // JobID
  name: string;      // Job 名称
  state: 'RUNNING' | 'PENDING' | 'FAILED' | 'COMPLETED';
  timeUsed: string;  // 已运行时长
  partition: string;
  gpuCount: number;  // 从 TRES 字段解析，格式 "gpu:N"
}
```

【UI 规格】
- 区块标题：`JOBS · N running` （N 实时更新）
- 每个 Job 显示为卡片：
  - 左侧彩色指示点（RUNNING=绿, PENDING=黄, FAILED=红, COMPLETED=灰）
  - Job 名称（主文字）+ Job ID（灰色 10px 小字）
  - Partition 和 GPU 数（次级行）
  - 两个按钮：`[复制 scancel <ID>]` 和 `[查看日志 ↓]`（日志功能后续实现，现在 disabled）
- `[复制 scancel]` 点击后：将字符串 `scancel <JobID>` 写入剪贴板，按钮临时变为 `✓ 已复制`（1.5 秒）
- 排序：RUNNING 在前，PENDING 其次，COMPLETED/FAILED 最后
- 空状态：显示 `暂无 Job，空闲中 ☕`

【菜单栏 badge 联动】
- 有 RUNNING job → Tray 图标 badge 显示数量，蓝色
- 有 FAILED job → badge 红色
- 无 job → 无 badge

使用 macOS 系统色（`--system-green`, `--system-red` 等 CSS 变量），支持 Dark Mode。

完成后告诉我如何验证，我会在有 job 运行时测试。
最后将 PROGRESS.md 中 Phase 2 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。
```

---

### 用户测试检查点 2 ⚠️ HPC 相关

**前置**：确保 HPC 上有至少一个 RUNNING 或 PENDING job（正常实验期间即可，**不需要为测试专门提交 job**）。

**验证项目**：
- [ ] Job 卡片正确显示（名称、状态点颜色、Partition、GPU 数）
- [ ] 菜单栏 badge 数字与 RUNNING job 数一致
- [ ] 点击 `[复制 scancel 12345]`，在终端粘贴确认内容正确，**不要实际执行 scancel**
- [ ] 等待 30 秒，job 状态自动刷新
- [ ] 无 job 时显示空状态文字

**安全确认**：⚠️ 本 Phase 只读取 squeue 数据，不提交、修改或取消任何 job。复制到剪贴板的 scancel 命令需要你**手动在终端执行**才会生效。

---

---

## Phase 3 — WandB 通知 & 概览

**目标**：接入 WandB REST API，展示 run 列表，触发 macOS 原生通知。

---

### Prompt 3

```
PhoenixPanel 的 Job 看板已完成（Phase 2）。现在实现 WandB 模块。

【API 配置】
- API Key 从 macOS Keychain 读取（keytar.getPassword('PhoenixPanel', 'wandb-api-key')）
- 若 Keychain 无 key，显示提示引导用户去 Preferences 设置
- 轮询间隔：固定 5 分钟（不可配置，避免超 rate limit）

【API 调用】（在 Electron 主进程发起，非渲染进程）
GET https://api.wandb.ai/api/v1/runs
  ?project=HPC-SIRSID&entity=<entity>&per_page=10&order=-created_at
Authorization: Bearer <API_KEY>

IPC 通道：`wandb:get-runs` → 返回最近 5 条 run 数据

【UI 规格】
每条 run 显示：
- 状态图标：✓ finished / ✗ crashed / ⏳ running / ⏸ killed
- Run 名称
- 主 metric（优先级：val/best_pred_top1 → val/top1 → val/top5，取第一个有值的）
- 若主 metric 是 top1，附带 top5 灰色小字
- 运行时长（秒转 "Xh Ym"）
- 相对时间（"N 分钟前"）

【通知逻辑】
- 维护一个本地 Map<run_id, state>，每次轮询对比状态变化
- 触发条件：state 从其他状态变为 finished / crashed / killed
- 使用 Electron `Notification` API（macOS 原生通知）
- 通知内容见 feature-spec.md M3 通知表格
- 防重复：已通知的 run_id+state 组合不再通知（缓存在内存，重启清空）

【错误处理】
- 401：显示 "API Key 无效，请在设置中更新"
- 超时 / 网络错误：保留上次数据，显示 "上次更新：N 分钟前"
- 429：自动退避，跳过本次轮询，下次延迟 10 分钟

完成后告诉我如何填入真实 API Key 进行测试。
最后将 PROGRESS.md 中 Phase 3 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。
```

---

### 用户测试检查点 3

**前置**：准备好 WandB API Key（在 wandb.ai → Settings → API Keys）。

**操作步骤**：
1. 按 Claude Code 的指引在 App 内填入 API Key（此步骤**仅在 App Preferences 界面操作**，不涉及 HPC）
2. 观察 WandB 区块是否加载数据

**验证项目**：
- [ ] 显示最近 5 条 run，状态图标正确
- [ ] `val/best_pred_top1` 或 `val/top1` 正确显示
- [ ] 触发通知测试：询问 Claude Code 如何 mock 一个 state 变化来触发通知，在**不向 HPC 提交任何 job 的情况下**验证通知样式
- [ ] 填入错误 API Key，确认显示错误提示而非崩溃

**不涉及 HPC，无安全风险。**

---

---

## Phase 4 — 日志查看器

**目标**：实现内联 SSH tail -f 日志流，只读展示。

---

### Prompt 4

```
PhoenixPanel 的 WandB 模块已完成（Phase 3）。现在实现日志查看器。

【触发方式】
Job 卡片上的 `[查看日志 ↓]` 按钮（Phase 2 中已 disabled，现在激活它）

【日志文件路径】
默认：~/slurm-<JobID>.out
若文件不存在，显示路径输入框让用户手动指定

【SSH 实现】
IPC 通道：`logs:start-stream` (jobId, filePath) → 开始 tail
IPC 通道：`logs:stop-stream` (jobId) → 停止 tail

主进程执行：ssh kcl-hpc "tail -f -n 50 <filePath>"
使用 SSH streaming，通过 IPC event 推送每行新内容到渲染进程

约束：
- 同时只允许一个活跃的 tail stream
- 打开新日志时自动关闭旧的
- Popover 隐藏时（blur 事件）自动断开 stream
- 内存中最多保留 500 行，超出时移除顶部旧行

【UI 规格】
- 背景 #1e1e1e（固定深色，不跟随 Light Mode）
- 字体 SF Mono 11px，行高 1.5
- 高度固定 200px，内部纵向滚动
- 新行到达时自动滚到底（除非用户手动向上滚动）
- 按钮：`[暂停滚动]` / `[恢复滚动]`，`[复制路径]`，`[✕ 收起]`
- `[复制路径]` 将完整文件路径写入剪贴板

完成后告诉我验证步骤，我会在 HPC 有活跃 job 时测试。
最后将 PROGRESS.md 中 Phase 4 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。
```

---

### 用户测试检查点 4 ⚠️ HPC 相关

**前置**：HPC 上有 RUNNING job，且 `~/slurm-<JobID>.out` 存在。

**验证项目**：
- [ ] 点击 `[查看日志 ↓]`，日志区域展开，显示最近 50 行
- [ ] 新日志行实时追加（等待约 30 秒观察）
- [ ] 点击 `[暂停滚动]`，新行追加但不自动滚动
- [ ] 点击 `[✕ 收起]` 后关闭，再打开另一个 job 的日志，确认旧 stream 已断开
- [ ] 关闭 Popover，重新打开，确认日志 stream 不会自动恢复（需重新点击按钮）

**安全确认**：⚠️ 本 Phase 只读取 `.out` 文件内容，不在 HPC 执行任何计算命令。

---

---

## Phase 5 — 存储配额 + 快速命令面板

**目标**：实现存储配额 Widget 和快速命令复制面板。

---

### Prompt 5

```
PhoenixPanel 的日志查看器已完成（Phase 4）。现在实现两个辅助模块。

【模块 A：存储配额 Widget】

数据获取（每 10 分钟轮询）：
- Home: ssh kcl-hpc "quota -s"
  解析 quota 输出，提取已用/上限（上限 50GB）
- Scratch: ssh kcl-hpc "du -sh ~/scratch"
  解析输出，手动设置上限 200GB

IPC 通道：`storage:get-quota` → 返回 {home: {used, limit}, scratch: {used, limit}}

UI：
- 两行进度条（Home / Scratch）
- 进度条颜色：<70% 绿，70-90% 橙，>90% 红（使用 macOS 系统色）
- 显示 "XX.X / YYY GB"
- du 命令可能较慢（大目录），加 loading spinner，超时 30 秒后显示上次数据 + "估算中"

注意：KCL HPC 的 quota 命令输出格式可能与标准不同，实现时需要做防御性解析。
若解析失败，显示 "—" 占位，不崩溃。

【模块 B：快速命令面板】

默认命令列表（硬编码）：
1. "查看我的 jobs" → squeue -u $USER
2. "只看 RUNNING" → squeue -u $USER -t RUNNING
3. "今日 job 历史" → sacct -u $USER --starttime=today --format=JobID,JobName,State,Elapsed,ExitCode
4. "Scratch 磁盘" → df -h ~/scratch
5. "Scratch 子目录大小" → du -sh ~/scratch/*
6. "GPU 状态" → nvidia-smi

自定义命令：
- 存储在 electron-store（JSON）
- `[＋ 添加命令]` → inline 输入框（标签 + 命令内容）
- 点击命令 → 复制到剪贴板 + 短暂 ✓ 反馈
- 右键点击自定义命令 → 显示 `[删除]` 选项

面板默认折叠，点击标题行展开/收起。

完成后告诉我验证步骤。
最后将 PROGRESS.md 中 Phase 5 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。
```

---

### 用户测试检查点 5 ⚠️ 部分 HPC 相关

**验证项目（存储配额）**：
- [ ] Home 和 Scratch 配额数字正确（⚠️ 与 `ssh kcl-hpc quota -s` 和 `du -sh ~/scratch` 手动对比）
- [ ] 进度条颜色反映正确阈值
- [ ] 手动调用时 du 命令可能需要等待，确认 loading 状态显示

**验证项目（快速命令，无 HPC 风险）**：
- [ ] 点击 `squeue -u $USER`，剪贴板内容正确（在终端粘贴验证，**不要求执行**）
- [ ] 添加一条自定义命令，关闭 App 重开后仍存在
- [ ] 右键删除自定义命令，刷新后消失

---

---

## Phase 6 — 偏好设置面板

**目标**：实现完整的 Preferences 二级视图，管理所有配置项。

---

### Prompt 6

```
PhoenixPanel 的核心功能模块已完成（Phase 1-5）。现在实现偏好设置面板。

【触发方式】
Popover 底部 Footer 区域的 `⚙` 按钮 → 在 Popover 内切换到设置视图（不弹新窗口）
设置视图顶部有 `← 返回` 按钮

【设置项（完整列表）】

连接配置：
- SSH Host Alias：文本输入框，默认 "kcl-hpc"
- HPC 用户名：文本输入框（尝试从 ~/.ssh/config 自动读取，失败则留空）

WandB 配置：
- API Key：密码输入框（显示为 ●●●●，值存 macOS Keychain via keytar）
  - 显示 `[测试连接]` 按钮，点击后发一次 API 请求验证 key 有效性
- Entity（WandB 用户名）：文本输入框
- Project 名称：文本输入框，默认 "HPC-SIRSID"

轮询设置：
- Job 看板刷新间隔：Slider，范围 10-120 秒，步长 10，显示当前值
- 存储配额刷新间隔：Slider，范围 5-60 分钟，步长 5

通知开关（4 个 Toggle）：
- Run 完成通知
- Run 崩溃通知
- Job FAILED 通知
- SSH 断连通知

【数据存储】
- API Key → keytar（macOS Keychain）
- 其余 → electron-store（~/.phoenixpanel/config.json 等效）
- 所有设置修改后实时保存（无需 Save 按钮）

【样式】
- 使用 macOS 原生风格的表单元素（系统色 Toggle、Slider）
- 分组之间有 separator 线
- 每个输入项有简短说明文字（灰色 11px）

完成后告诉我验证步骤。
最后将 PROGRESS.md 中 Phase 6 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。
```

---

### 用户测试检查点 6

**验证项目**：
- [ ] 点击 `⚙`，动画切换到设置视图；点击 `← 返回`，切回主视图
- [ ] 填入 WandB API Key，点击 `[测试连接]`，显示成功/失败反馈
- [ ] 修改 Job 刷新间隔为 10 秒，回主视图观察 Job 卡片刷新频率加快
- [ ] 关闭 App 重启，所有设置（除 API Key 外）从 config 文件恢复
- [ ] API Key 存在 Keychain 中（在终端验证：`security find-generic-password -a PhoenixPanel`）

**不涉及 HPC，无安全风险。**

---

---

## Phase 7 — 论文进度 Widget

**目标**：实现 NeurIPS 倒计时 + Notion 论文任务拉取，将科研 deadline 压力可视化进菜单栏。

---

### Prompt 7

```
PhoenixPanel 的偏好设置已完成（Phase 6）。现在实现论文进度 Widget。

【功能 A：倒计时（始终可用，不依赖 Notion）】
- 从 config.json 读取截止日期（默认 "2026-05-15"）
- 每分钟重新计算剩余天数和小时数
- IPC 通道：`paper:get-countdown` → 返回 {daysLeft, hoursLeft, deadline}

【功能 B：Notion 任务进度（可选，需 Notion Token）】
- Notion Integration Token 从 macOS Keychain 读取（keytar 服务名：PhoenixPanel-Notion）
- 查询 Notion 数据库（ID 从 config.json 读取，默认 "31550849010881d18632cd5df096638c"）
- API：POST https://api.notion.com/v1/databases/<db_id>/query
  Headers: { Authorization: "Bearer <TOKEN>", "Notion-Version": "2022-06-28" }
- 从结果提取每条 page 的 Title 字段和 Status/Checkbox 字段
- 轮询间隔：30 分钟
- IPC 通道：`paper:get-tasks` → 返回 {total, completed, tasks[{name, done}]}

【UI 规格】
区块标题行：NEURIPS 2026  ·  右侧显示 "X 天 Y 小时"（粗体红色/橙色/绿色）

倒计时进度条：
- 总长度代表从今天到截止日的时间跨度
- 进度为"已过去时间"（越长越紧迫）
- 颜色：>60天=绿，30-60天=橙，<30天=红

任务列表（若 Notion 已配置）：
- ✓ 已完成任务（灰色 + 删除线，折叠）
- ○ 未完成任务（正常，最多显示 5 条）
- 底部汇总行："共 N 项，M 项已完成 ✓"

降级（Notion 未配置）：
- 任务区域显示浅灰文字 "在设置中配置 Notion Token 以显示论文进度"

【Preferences 新增项（在现有设置面板追加一个 Paper 分组）】
- 论文截止日期：日期输入框，默认 2026-05-15
- Notion Token：密码框（存 Keychain），附带 [测试] 按钮
- Notion 数据库 ID：文本框，默认填入上述 ID

完成后告诉我验证步骤。
最后将 PROGRESS.md 中 Phase 7 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。
```

---

### 用户测试检查点 7

**验证项目（倒计时，无需 Notion）**：
- [ ] 倒计时数字正确（与手动计算的 `2026-05-15 - 今天` 天数一致）
- [ ] 修改 Preferences 截止日期为明天，倒计时立刻更新

**验证项目（Notion 集成，可选）**：
- [ ] 填入 Notion Integration Token + 数据库 ID，点击 `[测试]`，成功返回任务列表
- [ ] 论文任务数量和状态与 Notion 页面一致
- [ ] 故意填错 Token，显示友好错误，不崩溃整体

**不涉及 HPC，无安全风险。**

---

---

## Phase 9 — Markdown 阅览器（P2，可选）

**目标**：实现通过 SSH 读取远端 `.md` 文件并渲染的轻量功能。

---

### Prompt 9

```
PhoenixPanel 已完成所有核心功能（Phase 0-7）。现在实现低优先级的 Markdown 阅览器模块。

【入口】
快速命令面板底部新增 `📄 查看文档` 按钮

【交互流程】
1. 点击 `📄 查看文档` → 出现路径输入框（placeholder: "~/projects/SIR-SID/README.md"）
2. 用户输入路径，按 Enter 或点击 `[读取]`
3. 执行 ssh kcl-hpc "cat <filepath>"
4. 用 marked.js 渲染 HTML，展示在 Popover 内一个新的内联区域（可折叠）

【约束】
- 仅支持 .md 和 .txt 文件（其他扩展名拒绝并提示）
- 文件大小限制 200KB（超出提示"文件过大"）
- 只读，无编辑功能
- 最近访问的 5 个路径缓存在 electron-store，提供下拉历史

【渲染样式】
- 使用 marked.js 解析 Markdown
- 代码块使用等宽字体 SF Mono，浅灰背景
- 图片标签直接忽略（远程路径不可访问）
- 最大高度 300px，内部滚动

IPC 通道：`markdown:read` (filePath) → 返回文件内容字符串

完成后告诉我验证步骤。
最后将 PROGRESS.md 中 Phase 8 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。
```

---

### 用户测试检查点 9 ⚠️ HPC 相关

**验证项目**：
- [ ] 输入一个已知存在的 `.md` 文件路径（如 `~/projects/SIR-SID/README.md`），成功渲染
- [ ] 输入不存在的路径，显示友好错误提示
- [ ] 历史路径在下次打开时可用
- [ ] 输入 `.py` 文件路径，确认被拒绝

**安全确认**：⚠️ 本 Phase 只执行 `cat` 命令读取文件，不修改任何文件。

---

---

## Phase 10 — 打包 & 收尾

**目标**：配置 macOS 打包、图标，确保 App 可独立运行（脱离 `npm run dev`）。

---

### Prompt 10

```
PhoenixPanel 所有功能已完成（Phase 0-9）。现在进行打包配置和收尾工作。

请自主完成以下工作：

1. 设计并生成 App 图标：
   - 主图标：火焰 + 监控感，深色 macOS 风格
   - 生成 icns 格式（macOS 需要）和 16x16 PNG（菜单栏 Tray 用）
   - Tray 图标需要支持 template image（黑白，macOS 自动适配 Light/Dark）

2. 配置 electron-builder（在 package.json 或 electron-builder.yml）：
   - productName: PhoenixPanel
   - target: dmg + zip（macOS）
   - category: public.app-category.developer-tools
   - hardened runtime 配置（macOS Gatekeeper 要求）
   - entitlements：需要 `com.apple.security.network.client`（SSH/HTTP），`keychain-access-groups`（Keychain）

3. 运行 `npm run build`，生成 .app 和 .dmg

4. 检查并修复常见打包问题：
   - node-ssh 的 native 模块是否正确打包
   - keytar 的 native 模块重建（electron-rebuild）
   - SSH binary 路径是否能在打包后 App 中找到（应使用系统 /usr/bin/ssh）

5. 在 README.md 中写明：
   - 安装步骤
   - 首次使用配置（SSH config、WandB API Key）
   - 已知限制（需要 Tailscale 连接、KCL VPN 等）

完成后告诉我如何安装并运行打包后的 App。
最后将 PROGRESS.md 中 Phase 9 的状态更新为 🔄 进行中，完成后改为 ✅ 已完成，填写完成时间和备注。总览表中所有 Phase 均已完成时，在文件顶部加一行 🎉 所有 Phase 完成。
```

---

### 用户测试检查点 10（最终验收）

**验证项目**：
- [ ] 双击 `.dmg`，拖入 Applications，冷启动（不用 `npm run dev`）运行正常
- [ ] 菜单栏图标清晰，Light/Dark Mode 下均显示正常
- [ ] 所有功能在打包版本中正常工作（完整回归测试 Phase 1-7 的检查项）
- [ ] macOS Gatekeeper 不阻止启动（或 Claude Code 说明如何处理签名问题）

---

---

## 附：与 Claude Code 协作的注意事项

**你需要做的**：
1. 按顺序粘贴每个 Phase 的 Prompt
2. 按检查点验收，将结果（截图 / 报错文字）反馈给 Claude Code
3. ⚠️ HPC 相关测试时，你是唯一有权决定是否在 HPC 终端执行命令的人

**Claude Code 会自主完成**：
- 所有前端代码（React + TypeScript）
- Electron 主进程逻辑
- 依赖安装和配置文件
- 单模块的内部 debug

**你无需懂**：
- 具体的 React/TypeScript 语法
- Electron IPC 机制
- 打包配置细节

**遇到 Claude Code 卡住时**：将报错信息完整粘贴给它，说明"这是我按你说的操作后出现的报错"，它会自行修复。
```
