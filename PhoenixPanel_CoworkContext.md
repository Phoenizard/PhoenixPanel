# PhoenixPanel — Cowork Context Prompt

> 将以下内容粘贴到 Cowork 对话框，AI 即可理解完整背景。

---

## 你好！我正在设计一个 macOS 本地 App，叫做 **PhoenixPanel**。

### 关于我

我是一名最终年本科生（University of Nottingham）+ KCL ML 研究员，同时管理：
- **KCL CREATE HPC**：提交 SLURM job 跑深度学习实验（SIR-SID 项目，ImageNet-100 分类）
- **Windows PC**：小型本地实验
- **Mac**：主力开发机

我用 Tailscale + SSH 连接各机器，`~/.ssh/config` 已配好 alias。WandB 用于实验追踪（project: `HPC-SIRSID`）。

---

### App 的核心设计哲学

**只读 + 辅助，永不代劳执行。**

基于我的 HPC SOP，KCL HPC 上所有执行操作（sbatch / srun / python）必须由我本人手动执行。App 的边界：

| App 能做 ✅ | App 不做 ❌ |
|---|---|
| 查看 squeue 状态 | sbatch / srun / scancel |
| tail job 日志 | 任何 python 命令 |
| WandB run 完成通知 | 修改代码文件 |
| 显示命令供复制 | git push |
| 查看 scratch 配额 | 任何写操作 |

---

### 已确定的功能模块

1. **菜单栏常驻图标** — badge 显示 running jobs 数，颜色反映状态
2. **Job 看板（只读）** — squeue 解析，cancel 按钮只复制命令到剪贴板
3. **WandB 通知（事件驱动）** — 5分钟轮询，run finished/crashed 触发 macOS 通知
4. **日志查看器** — SSH tail -f 远程 .out 文件，只读
5. **快速命令面板** — 常用命令点击复制，不执行
6. **存储配额 widget** — Home(50G) / Scratch(200G) 使用情况

---

### 技术栈方向

- **Electron + React**（macOS only）
- SSH 用本地 `ssh` binary（复用 `~/.ssh/config`，host alias: `kcl-hpc`）
- WandB REST API
- macOS Keychain 存储 API key

---

### 工作空间结构

我们将在 Cowork 中用以下几个文件分板块管理设计：

- `overview.md` — 本文件，背景 + 核心哲学
- `ui-design.md` — 界面设计（布局、交互、视觉风格）
- `feature-spec.md` — 功能详细设计（每个模块的具体行为）
- `claude-code-prompts.md` — 分阶段 Claude Code 执行步骤
- `workflow-sop.md` — 与现有 HPC SOP 的衔接说明

---

### 当前状态

设计阶段，尚未写任何代码。我希望先把各板块设计文档完善，再交给 Claude Code vibe coding 执行。

**请帮我从 `ui-design.md` 开始，引导我完善界面设计。**
