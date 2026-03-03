# PhoenixPanel — UI Design Spec

## 1. 交互模式

**Popover（菜单栏下拉悬浮面板）**

- 点击菜单栏图标 → 面板从图标处向下弹出
- 点击面板外任意区域 → 自动关闭
- 不占 Dock，无独立 App 窗口
- 日志查看器：在 Popover 内以 **展开区域（inline expand）** 呈现，不弹新窗口

---

## 2. 视觉风格

**macOS 原生 + vibrancy**

| 属性 | 规格 |
|---|---|
| 背景 | `NSVisualEffectView`（Electron：`vibrancy: 'under-window'`）|
| 颜色系统 | macOS 语义色（`label`, `secondaryLabel`, `separator`, `controlAccentColor`）|
| 图标 | SF Symbols（通过 `sf-symbols` npm 包或 SVG 导出）|
| 字体 | SF Pro（系统默认，`font-family: -apple-system`）|
| 圆角 | 卡片 `8px`，面板整体 `12px`（系统默认）|
| Dark Mode | 自动跟随系统，无需手动切换 |
| 动画 | 原生弹出动画，内容切换 `150ms ease-out` |

---

## 3. 菜单栏图标

```
[🔥 2]   ← 火焰图标 + running job 数量 badge
```

| 状态 | 图标颜色 | Badge |
|---|---|---|
| 无 job 运行 | 系统默认灰 | 无 |
| 有 job 运行 | 系统 accent 蓝 | 数字（running 数）|
| 有 job failed | 红色 | 数字（failed 数）|
| SSH 断连 | 橙色 | `!` |

---

## 4. Popover 尺寸

- **宽度**：400px（固定）
- **高度**：最大 580px，内容不足时收缩，超出时内部滚动
- **内边距**：`16px` 四周

---

## 5. 布局结构（从上到下）

### 5.1 Header 栏（固定，不滚动）

```
┌─────────────────────────────────────────┐
│  🔥 PhoenixPanel        ● kcl-hpc  刷新  │
└─────────────────────────────────────────┘
```

- 左：App 名 + 图标
- 右：SSH 连接状态点（绿=已连、橙=重连中、红=断连）+ 主机名 + 刷新按钮（`SF: arrow.clockwise`）
- 底部 `1px separator`

---

### 5.2 Jobs 区块（优先级 1）

```
┌─────────────────────────────────────────┐
│  JOBS  ·  2 running  1 pending           │
├─────────────────────────────────────────┤
│  ● resnet50-exp3        RUNNING  00:42   │
│    Partition: gpu  ·  GPUs: 2            │
│    [复制 scancel 12345]                   │
│                                          │
│  ● vit-baseline         RUNNING  01:15   │
│    Partition: gpu  ·  GPUs: 4            │
│    [复制 scancel 12346]    [查看日志 ↓]   │
│                                          │
│  ○ aug-ablation         PENDING          │
│    Partition: gpu  ·  Priority: 120      │
└─────────────────────────────────────────┘
```

**状态指示点颜色**：
- 🟢 RUNNING
- 🟡 PENDING
- 🔴 FAILED
- ⚫ COMPLETED

**按钮行为**（严格只读）：
- `[复制 scancel XXXXX]` → 写入剪贴板，按钮短暂变为 `✓ 已复制`，不执行任何操作
- `[查看日志 ↓]` → 在该 Job 卡片下方内联展开日志区域

---

### 5.3 日志查看器（内联展开，仅在 Job 卡片内）

```
│  ▼ vit-baseline  —  ~/scratch/logs/12346.out         │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Epoch [23/100] Loss: 2.341 Acc: 0.412             │ │
│ │ Epoch [24/100] Loss: 2.287 Acc: 0.431             │ │
│ │ ...                                               │ │
│ └───────────────────────────────────────────────────┘ │
│  [暂停滚动]  [复制路径]                    ✕ 收起     │
```

- 背景：`codeBlock` 风格（深色，等宽字体 `SF Mono 11px`）
- `tail -f` 实时追加，自动滚到底
- `[暂停滚动]`：停止自动滚动，方便查看历史
- 最多同时展开 **1 个**日志（展开新的自动收起旧的）

---

### 5.4 WandB 区块（优先级 2）

```
┌─────────────────────────────────────────┐
│  WANDB  ·  HPC-SIRSID              ↗    │
├─────────────────────────────────────────┤
│  ✓ resnet50-exp3   完成   val_acc: 0.847 │
│    运行时长: 2h14m  ·  4h 前             │
│                                          │
│  ✗ aug-ablation    崩溃   OOM error      │
│    运行时长: 0h03m  ·  1h 前             │
└─────────────────────────────────────────┘
```

- `↗` 图标 → 复制 WandB 项目 URL 到剪贴板（不打开浏览器，用户自行决定）
- 每条 run 显示：名称、状态、关键 metric（val_acc 或错误信息）、时长、相对时间
- 只显示最近 **5 条** runs，避免过长
- 轮询间隔：5 分钟（与 macOS 通知联动）

---

### 5.5 存储配额 Widget（优先级 3，紧凑型）

```
┌─────────────────────────────────────────┐
│  STORAGE  ·  kcl-hpc                    │
│  Home    ████████░░  38.2 / 50 GB       │
│  Scratch ████░░░░░░  82.4 / 200 GB      │
└─────────────────────────────────────────┘
```

- 进度条：< 70% 绿，70-90% 橙，> 90% 红
- 数据来源：SSH `du -sh` + `quota` 命令（只读）

---

### 5.6 快速命令面板（可折叠，默认收起）

```
┌─────────────────────────────────────────┐
│  QUICK COMMANDS                    ▶    │
└─────────────────────────────────────────┘
```

展开后：

```
┌─────────────────────────────────────────┐
│  QUICK COMMANDS                    ▼    │
├─────────────────────────────────────────┤
│  [squeue -u $USER]                      │
│  [watch -n 30 squeue -u $USER]          │
│  [sacct -j JOBID --format=...]          │
│  [df -h ~/scratch]                      │
│  ＋ 自定义命令...                        │
└─────────────────────────────────────────┘
```

- 点击任意命令 → 复制到剪贴板
- `＋ 自定义命令` → 弹出简单输入框，保存到本地 JSON

---

## 6. 通知设计（macOS 原生通知）

| 触发事件 | 通知标题 | 通知正文 |
|---|---|---|
| Run 完成 | `✓ WandB Run 完成` | `resnet50-exp3: val_acc=0.847` |
| Run 崩溃 | `✗ WandB Run 崩溃` | `aug-ablation: OOM error` |
| Job 进入 FAILED | `⚠ SLURM Job 失败` | `Job 12346 (vit-baseline) FAILED` |
| SSH 断连 | `⚡ 连接中断` | `kcl-hpc 连接丢失，正在重试…` |

- 使用 Electron `Notification` API → 触发原生 macOS 通知
- 点击通知 → 打开 PhoenixPanel Popover 并定位到相关区块

---

## 7. 空状态 / 错误状态

| 场景 | 显示 |
|---|---|
| 无 running jobs | `暂无运行中的 Job` + 淡灰图标 |
| SSH 未连接 | 整个面板显示连接错误横幅，其他区块 skeleton 占位 |
| WandB API 失败 | WandB 区块显示 `API 请求失败，请检查 API Key` |
| 配额数据获取失败 | `—` 占位，不崩溃整体 |

---

## 8. 待确认事项（留给 feature-spec.md）

- WandB 显示的具体 metric 字段名（`val_acc`？`val/top1`？）
- 快速命令默认列表的具体内容
- 是否需要偏好设置面板（Preferences）
- SSH 重连策略（retry 次数 / 间隔）
