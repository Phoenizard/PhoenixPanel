# PhoenixPanel — Claude Code Context

## 项目简介
PhoenixPanel 是一个 macOS 菜单栏 App，用于监控 KCL HPC 上的 SLURM job 状态和 WandB 实验进度。

**技术栈**：Electron + React + TypeScript，macOS only。

## ⚠️ 核心约束：只读原则

**App 永远不执行任何写操作或计算操作。**

SSH 白名单——只允许以下命令开头，其他一律拒绝：
- `squeue`
- `sacct`
- `quota`
- `df`
- `du`
- `tail`
- `cat`
- `echo`

违规示例（绝对禁止）：`sbatch`、`srun`、`scancel`、`python`、`git`、任何写操作。

所有"执行"功能均替换为"复制命令到剪贴板"。

## 设计文档
全部在项目根目录：
- `ui-design.md` — 界面布局与视觉规格
- `feature-spec.md` — 各模块功能详细设计
- `claude-code-prompts.md` — 分阶段开发指引

## 开发进度
见 `PROGRESS.md`——**每个 Phase 完成后必须更新它**。

## 项目结构约定
```
phoenixpanel/
├── electron/
│   ├── main.ts          # Electron 主进程
│   ├── ssh-manager.ts   # SSH 连接管理（含命令白名单）
│   ├── ipc-handlers.ts  # IPC 通道定义
│   └── preload.ts       # 预加载脚本
├── src/
│   └── renderer/        # React 渲染进程
├── CLAUDE.md            # 本文件
├── PROGRESS.md          # 开发进度追踪
└── [设计文档].md
```

## 敏感信息存储规范
- WandB API Key → macOS Keychain（`keytar`，服务名：`PhoenixPanel`）
- Notion Token → macOS Keychain（服务名：`PhoenixPanel-Notion`）
- 其余配置 → `electron-store`（本地 JSON，不含敏感信息）
