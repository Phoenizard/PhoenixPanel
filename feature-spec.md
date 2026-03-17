# PhoenixPanel — Feature Spec

> 所有功能遵循**只读 + 辅助，永不代劳执行**原则。
> App 只读取数据、显示状态、复制命令到剪贴板；一切实际操作由用户在终端手动执行。

---

## 模块总览

| # | 模块 | 优先级 | 数据来源 |
|---|---|---|---|
| 1 | 菜单栏图标 | P0 | 本地状态聚合 |
| 2 | Job 看板 | P0 | SSH → `squeue` |
| 3 | WandB 通知 & 概览 | P0 | WandB REST API |
| 4 | 日志查看器 | P1 | SSH → `tail -f` |
| 5 | 存储配额 Widget | P1 | SSH → `df` / `quota` |
| 6 | 快速命令面板 | P1 | 本地 JSON 配置 |
| 7 | 偏好设置面板 | P1 | macOS Keychain + 本地 config |
| 8 | Markdown 阅览器 | P2 | SSH → `cat` 文件 |
| 9 | 论文进度 Widget | P1 | Notion API + 本地 config |

---

## M1 — 菜单栏图标

### 功能描述
常驻菜单栏，通过图标颜色和 badge 数字让用户一眼掌握整体状态，无需打开 Popover。

### 状态逻辑

| 优先级 | 条件 | 图标颜色 | Badge |
|---|---|---|---|
| 1（最高）| SSH 断连 | 橙色 | `!` |
| 2 | 有 FAILED job | 红色 | failed 数量 |
| 3 | 有 RUNNING job | accent 蓝 | running 数量 |
| 4 | 仅 PENDING | 系统灰 | pending 数量 |
| 5 | 无 job | 系统灰 | 无 badge |

- badge 数字使用 macOS 系统 badge 样式（右上角红色圆点）
- 状态按优先级取最高级显示，不叠加多个颜色

### 刷新时机
- 每次 `squeue` 轮询完成后更新（间隔见 M2）
- SSH 状态变化时立即更新

---

## M2 — Job 看板

### 功能描述
解析 `squeue` 输出，以卡片列表形式展示当前用户的所有 job。

### 数据获取

```bash
# 执行命令（只读）
ssh kcl-hpc "squeue -u $USER --format='%i|%j|%T|%M|%P|%C|%b' --noheader"
```

字段映射：`JobID | Name | State | TimeUsed | Partition | NumCPUs | TRES(GPU数)`

**⚠️ DDP 多卡作业的 GPU 数解析**

KCL HPC 上的 DDP 作业（如 8×GPU）通过 `--gres=gpu:N` 分配，`%b`（TRES）字段格式多变，解析必须做防御性处理：

```
# 可能出现的 TRES 格式：
gpu:8                              → 直接格式
gres/gpu:8                         → 标准 GRES 格式
gres/gpu:a100:8                    → 含 GPU 型号
billing=8,cpu=32,gres/gpu:a100:8,mem=64G,node=2  → 完整 TRES 字符串
N/A                                → 无 GPU 分配（CPU only job）
```

解析逻辑（优先级从高到低）：
1. 正则匹配 `gres/gpu(?::[^:]+)?:(\d+)` → 捕获最后一个数字
2. 正则匹配 `^gpu:(\d+)` → 简单格式
3. 以上均不匹配 → 显示 `CPU only`，不报错

**轮询间隔**：30 秒（可在 Preferences 调整，范围 10s–120s）

### 显示字段（每张卡片）

| 字段 | 说明 |
|---|---|
| Job 名称 | `%j` |
| Job ID | `%i`（灰色小字）|
| 状态 | RUNNING / PENDING / FAILED / COMPLETED |
| 已运行时长 | `%M` |
| Partition | `%P` |
| GPU 数量 | 从 `%b`（TRES）解析，显示为 `GPUs: N` |

### 状态颜色
- RUNNING：绿色指示点
- PENDING：黄色指示点
- FAILED：红色指示点
- COMPLETED：灰色指示点（仅在最近 10 分钟内完成的 job 中短暂保留，之后从列表消失）

### 操作按钮（严格只读）

**`[复制 scancel <JobID>]`**
- 行为：将 `scancel <JobID>` 写入系统剪贴板
- 反馈：按钮文字变为 `✓ 已复制`，持续 1.5 秒后恢复
- 不执行任何 SSH 命令

**`[复制 ID]`** *(新增)*
- 行为：仅将纯 Job ID（如 `32635424`）写入系统剪贴板，不含 scancel
- 反馈：按钮文字变为 `✓`，持续 1.5 秒后恢复
- 用途：用户可自行在终端组合命令，如 `scontrol show job <ID>`、`ssh-log <ID>` 等

**`[查看日志 ↓]`**
- 行为：在该 job 卡片下方内联展开日志查看器（M4），默认加载 `.out` 文件
- 同时只能展开 1 个日志面板；展开新的自动收起旧的

### 排序规则
1. RUNNING jobs（按 JobID 升序）
2. PENDING jobs（按 Priority 降序，需额外 `squeue -o '%Y'` 字段）
3. 近期 COMPLETED/FAILED（如在 10 分钟内）

### 空状态
- 无任何 job：显示 `暂无 Job，空闲中 ☕`
- SSH 未连接：显示连接错误横幅，列表区域用 skeleton 占位

---

## M3 — WandB 通知 & 概览

### 功能描述
轮询 WandB API，在 Popover 内展示最近 runs 状态，并在 run 完成/崩溃时触发 macOS 原生通知。

### API 调用

```
GET https://api.wandb.ai/api/v1/runs
  ?project=HPC-SIRSID
  &entity=<username>
  &per_page=10
  &order=-created_at
Authorization: Bearer <API_KEY>
```

**轮询间隔**：5 分钟（固定，不可调整——避免超出 WandB API rate limit）

### Popover 内展示字段（每条 run）

| 字段 | 说明 |
|---|---|
| Run 名称 | `run.name` |
| 状态图标 | ✓ finished / ✗ crashed / ⏳ running / ⏸ killed |
| 主要 Metric | 按以下优先级取第一个存在的值：`val/best_pred_top1` → `val/top1` → `val/top5` |
| 次要 Metric | 若主 metric 显示的是 top1，则附带 top5（灰色小字）|
| 运行时长 | `run.duration`（秒转换为 `Xh Ym` 格式）|
| 相对时间 | `N 分钟前` / `N 小时前` |

- 只显示最近 **5 条** runs（finished / crashed / running 均计入）
- Running 状态的 run 显示实时 metric（每次轮询刷新）

### 通知触发规则

| 事件 | 条件 | 通知标题 | 通知正文 |
|---|---|---|---|
| Run 完成 | `state` 从非 `finished` 变为 `finished` | `✓ WandB Run 完成` | `<run名>: val/best_pred_top1=<值>` |
| Run 崩溃 | `state` 变为 `crashed` | `✗ WandB Run 崩溃` | `<run名>: <error 摘要前50字符>` |
| Run 被 kill | `state` 变为 `killed` | `⏸ WandB Run 已终止` | `<run名>: 被手动终止` |

**防重复通知机制**：本地缓存已通知的 `run_id + state` 组合，避免每次轮询重复触发。缓存在 App 重启后清空。

### 点击通知行为
- 打开 Popover
- 自动滚动到 WandB 区块
- 对应 run 卡片短暂高亮（`300ms` 黄色背景 → 淡出）

### 错误状态
- API Key 无效（401）：显示 `API Key 无效，请在设置中更新`
- 网络超时：显示 `WandB 数据获取失败`，保留上次数据并显示"上次更新：N 分钟前"
- Rate limit（429）：自动退避，下次轮询延迟 10 分钟，显示灰色警告

---

## M4 — 日志查看器

### 功能描述
通过 SSH `tail -f` 实时追踪 SLURM job 的 `.out` / `.err` 文件内容，以终端风格展示，支持文本选中与复制。

### 触发方式
Job 看板（M2）中点击 `[查看日志 ↓]` 按钮，在对应 job 卡片下方内联展开。

### 日志文件类型切换 *(新增)*
同一 Job 同时存在两类日志文件（SLURM 默认命名，同目录）：
- **`.out`**（标准输出）：`~/slurm-<JobID>.out`，默认加载
- **`.err`**（标准错误）：`~/slurm-<JobID>.err`，用户可切换查看

切换方式：日志面板顶部显示 `[.out]` / `[.err]` Tab 标签，点击切换。切换时：
- 断开当前 SSH tail 连接
- 建立新连接加载对应文件
- 日志内容清空后重新流式载入

### 日志文件路径推断
SLURM 默认输出路径为 `~/slurm-<JobID>.out` 和 `~/slurm-<JobID>.err`。
若文件不存在，提示用户手动输入路径（仅 `.out` 需要；`.err` 路径自动与 `.out` 同目录同 ID）。

### SSH 命令

```bash
ssh kcl-hpc "tail -f -n 50 ~/slurm-<JobID>.out"
ssh kcl-hpc "tail -f -n 50 ~/slurm-<JobID>.err"
```

- 初始加载最近 50 行
- 保持 SSH 连接持续输出新行（streaming）

### 展示规格

| 属性 | 规格 |
|---|---|
| 背景 | 深色（`#1e1e1e`，不跟随 Light Mode）|
| 字体 | SF Mono，11px |
| 最大显示行数 | 内存中保留最近 500 行，超出时顶部自动移除 |
| 区域高度 | 固定 200px，内部滚动 |
| 文本选中 | ✅ 支持鼠标拖拽选中文本 *(新增)* |
| 复制选中内容 | ✅ 支持 Cmd+C 或右键复制 *(新增)* |

### 控制按钮

| 按钮 | 行为 |
|---|---|
| `[.out]` / `[.err]` Tab | 切换查看标准输出 / 标准错误文件 *(新增)* |
| `[暂停滚动]` / `[恢复滚动]` | 切换自动滚到底的行为 |
| `[复制路径]` | 复制当前日志文件完整路径到剪贴板 |
| `✕ 收起` | 关闭内联日志区域，断开 SSH tail 连接 |

### 注意事项
- 关闭 Popover 时**自动断开** tail SSH 连接（不后台继续）
- 重新打开 Popover 时**不自动恢复**日志流（需用户重新点击 `[查看日志]`）
- 文本选中与自动滚动共存：有文本被选中时暂停自动滚动，取消选中后恢复

---

## M5 — 存储配额 Widget

### 功能描述
显示 KCL HPC 的 Home 和 Scratch 分区使用情况，以进度条形式呈现。

### 数据获取

```bash
# Home 配额（KCL 使用 quota 命令）
ssh kcl-hpc "quota -s"

# Scratch 使用量（quota 不覆盖 scratch，用 du 估算）
ssh kcl-hpc "du -sh ~/scratch 2>/dev/null || echo 'N/A'"
```

**轮询间隔**：10 分钟（存储变化慢，不需要高频）

### 显示规格

| 分区 | 上限 | 数据来源 |
|---|---|---|
| Home | 50 GB | `quota -s` 解析 |
| Scratch | 200 GB | `du -sh ~/scratch` 估算 |

**进度条颜色阈值**：
- 0–70%：绿色（`systemGreen`）
- 70–90%：橙色（`systemOrange`）
- 90–100%：红色（`systemRed`）

### 错误状态
- `du` 超时（scratch 很大时可能慢）：显示上次数据 + `估算中…` 标记
- 无法解析 `quota` 输出：显示 `—`，不崩溃整体

---

## M6 — 快速命令面板

### 功能描述
提供常用 HPC 命令的一键复制，降低切换到终端的频率。

### 默认命令列表

| 命令 | 说明 |
|---|---|
| `squeue -u $USER` | 查看我的 jobs |
| `squeue -u $USER -t RUNNING` | 只看运行中的 jobs |
| `sacct -u $USER --starttime=today --format=JobID,JobName,State,Elapsed,ExitCode` | 今日 job 历史 |
| `df -h ~/scratch` | Scratch 磁盘使用 |
| `du -sh ~/scratch/*` | Scratch 各子目录大小 |
| `nvidia-smi` | GPU 状态（在计算节点）|

### 自定义命令
- 点击 `＋ 添加命令` → 弹出输入框（标签 + 命令内容）
- 保存到 `~/.phoenixpanel/custom-commands.json`
- 支持删除自定义命令（长按或右键）
- 不支持直接编辑（删除后重新添加）

### 行为
- 点击任意命令 → 复制到剪贴板，按钮短暂显示 `✓`
- 命令中的 `$USER` 在复制时**不展开**（保留变量，让用户在 shell 中展开）
- 面板默认**收起**，保持 Popover 紧凑

---

## M7 — 偏好设置面板

### 触发方式
Popover 底部的 `⚙` 按钮 → 打开偏好设置（作为 Popover 内的第二级视图，不弹新窗口）

### 设置项

#### 连接配置
| 设置项 | 类型 | 默认值 |
|---|---|---|
| SSH Host Alias | 文本输入 | `kcl-hpc` |
| HPC 用户名 | 文本输入 | 自动读取 `~/.ssh/config` |

#### WandB 配置
| 设置项 | 类型 | 默认值 |
|---|---|---|
| API Key | 密码输入（存 macOS Keychain）| — |
| Entity（用户名）| 文本输入 | — |
| Project 名称 | 文本输入 | `HPC-SIRSID` |

#### 轮询设置
| 设置项 | 类型 | 范围 | 默认值 |
|---|---|---|---|
| Job 看板刷新间隔 | Slider + 数字 | 10–120 秒 | 30 秒 |
| 存储配额刷新间隔 | Slider + 数字 | 5–60 分钟 | 10 分钟 |

> WandB 轮询间隔固定 5 分钟，不开放调整。

#### 通知设置
| 设置项 | 类型 | 默认值 |
|---|---|---|
| Run 完成通知 | Toggle | 开 |
| Run 崩溃通知 | Toggle | 开 |
| Job FAILED 通知 | Toggle | 开 |
| SSH 断连通知 | Toggle | 开 |

### 数据存储
- API Key → macOS Keychain（`security add-generic-password`）
- 其余配置 → `~/.phoenixpanel/config.json`（明文，不含敏感信息）

### 配置文件格式示例

```json
{
  "ssh": {
    "host": "kcl-hpc",
    "username": "k12345678"
  },
  "wandb": {
    "entity": "phoenizard",
    "project": "HPC-SIRSID"
  },
  "polling": {
    "jobs_interval_sec": 30,
    "storage_interval_min": 10
  },
  "notifications": {
    "run_finished": true,
    "run_crashed": true,
    "job_failed": true,
    "ssh_disconnected": true
  }
}
```

---

## M8 — Markdown 阅览器（P2，低优先级）

### 功能描述
通过 SSH 读取远端 `.md` 文件，在 Popover 内以渲染后的 HTML 形式只读展示。适合快速查看实验笔记、SOP 文档等。

### 触发方式
快速命令面板底部新增 `📄 查看文档` 入口 → 弹出文件路径输入框 → 读取并渲染。

### 数据获取

```bash
ssh kcl-hpc "cat <filepath>"
```

文件内容返回后，在 Electron 端用 `marked.js` 渲染为 HTML。

### 展示规格
- 最大文件大小：200 KB（超出提示"文件过大，请在终端查看"）
- 支持格式：标准 Markdown（标题、列表、代码块、表格）
- 不支持：图片（远程图片路径不可访问）
- 只读，无编辑功能

### 文件历史
- 本地缓存最近访问的 5 个文件路径（存 `config.json`），提供快速再访问
- 不缓存文件内容（每次重新从 SSH 读取，保证最新）

### 实现复杂度评估
**低**——Electron WebView + `marked.js` 渲染，单次 SSH `cat`，无需 streaming。可作为快速功能追加，不影响核心模块开发。

---

## M9 — 论文进度 Widget

### 功能描述
在 Popover 内显示 NeurIPS 2026 截止日期倒计时，以及从 Notion 拉取的论文写作任务进度，让实验监控和论文进度一体化。

### 数据来源

**倒计时（本地计算，无需网络）**
- 截止日期存在 `config.json`（默认 `2026-05-15`，可在 Preferences 修改）
- 每分钟重新计算，显示剩余天数 + 小时数

**Notion 进度（可选，需配置 Notion API Key）**
- 读取 Paper Writing Tracker 数据库（Page ID：`31550849010881d18632cd5df096638c`）
- Notion Integration Token 存 macOS Keychain（`keytar` 服务名：`PhoenixPanel-Notion`）
- 轮询间隔：30 分钟（论文进度变化慢）

IPC 通道：`paper:get-status` → 返回倒计时 + Notion 任务列表

### Notion 数据获取

```
GET https://api.notion.com/v1/databases/<db_id>/query
Authorization: Bearer <NOTION_TOKEN>
Notion-Version: 2022-06-28
```

从数据库条目中提取：
- 任务名称（`Name` / Title 字段）
- 完成状态（`Status` / Checkbox 字段）
- 优先级（若有）

### UI 规格

```
┌─────────────────────────────────────────┐
│  NEURIPS 2026                    73 天  │
│  ████████████░░░░░░░  May 15 deadline   │
├─────────────────────────────────────────┤
│  ✓ Exp R-01 复现完成                    │
│  ○ HGB ablation table                   │
│  ○ IB Theory 可视化                     │
│  ○ Related Work 初稿                    │
│  ··· 共 N 项，M 项已完成               │
└─────────────────────────────────────────┘
```

**倒计时进度条颜色**：
- > 60 天：绿色
- 30–60 天：橙色
- < 30 天：红色（紧迫警告）

**任务列表**：
- ✓ 已完成（灰色删除线）
- ○ 未完成（正常文字）
- 最多显示 5 条未完成任务，超出折叠
- 底部显示"共 N 项，M 项已完成"汇总

### 降级行为（Notion 未配置或请求失败）
- 只显示倒计时部分，任务列表区域显示 `"配置 Notion Token 以显示论文任务进度"`
- 倒计时功能完全独立于 Notion，始终可用

### Preferences 新增配置项
| 设置项 | 类型 | 默认值 |
|---|---|---|
| 论文截止日期 | 日期选择器 | `2026-05-15` |
| Notion Integration Token | 密码输入（Keychain）| — |
| Notion 数据库 ID | 文本输入 | `31550849010881d18632cd5df096638c` |

---

## 全局行为规范

### SSH 连接管理
- App 启动时建立 SSH 连接，失败时每 30 秒重试一次（最多重试 5 次后停止，等待用户手动刷新）
- 使用 SSH ControlMaster 复用连接，避免每次轮询都重新握手：

  ```
  # ~/.ssh/config 推荐配置（由用户自行添加）
  Host kcl-hpc
    ControlMaster auto
    ControlPath ~/.ssh/control-%r@%h:%p
    ControlPersist 10m
  ```
- SSH 密钥认证（复用 `~/.ssh/config` 已有配置），App 不处理密码输入

### 错误处理原则
1. 单个模块失败**不影响其他模块**（隔离错误）
2. 错误信息显示在对应区块内，不弹出全局 alert
3. 保留上次成功的数据并标注"数据可能已过时"

### 数据不持久化原则
- App 退出后不缓存 `squeue` / WandB 数据
- 重启后所有数据重新从源获取
- 例外：Preferences 配置、自定义命令列表、Markdown 文件历史
