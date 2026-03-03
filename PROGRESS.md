# PhoenixPanel — 开发进度

> Claude Code 在每个 Phase 完成后更新本文件。
> 格式：状态 + 完成时间 + 简短备注（遇到的问题、关键决定）。

## 进度总览

| Phase | 内容 | 状态 | 完成时间 |
|---|---|---|---|
| 0 | 项目脚手架 + Popover 框架 | ✅ 已完成 | 2026-03-03 |
| 1 | SSH 连接层 + 命令白名单 | ✅ 已完成 | 2026-03-03 |
| 2 | Job 看板（squeue + DDP 解析）| ✅ 已完成 | 2026-03-03 |
| 3 | WandB 通知 & 概览 | ✅ 已完成 | 2026-03-03 |
| 4 | 日志查看器（SSH tail -f）| ✅ 已完成 | 2026-03-03 |
| 5 | 存储配额 + 快速命令面板 | ✅ 已完成 | 2026-03-03 |
| 6 | 偏好设置面板 | ✅ 已完成 | 2026-03-03 |
| 7 | 论文进度 Widget（NeurIPS DDL + Notion）| ⬜ 未开始 | — |
| 8 | Markdown 阅览器（P2，可选）| ⬜ 未开始 | — |
| 9 | 打包 & 收尾（.dmg）| ⬜ 未开始 | — |

状态标记：⬜ 未开始 · 🔄 进行中 · ✅ 已完成 · ⚠️ 有问题

---

## Phase 记录

### Phase 0 — 项目脚手架
- **状态**：✅ 已完成
- **完成时间**：2026-03-03
- **备注**：使用 `create-electron-vite` React 模板（vite-plugin-electron）。主进程配置 Tray（动态 nativeImage 生成 16×16 圆形图标）+ BrowserWindow（type: panel，vibrancy: under-window，transparent，frame: false）。点击托盘图标弹出毛玻璃面板，blur 自动隐藏。依赖：electron-store@8（v9+ ESM only 故锁 v8）、keytar、marked、node-ssh。

---

### Phase 1 — SSH 连接层
- **状态**：✅ 已完成
- **完成时间**：2026-03-03
- **备注**：`ssh-manager.ts` 实现命令白名单（squeue/sacct/quota/df/du/tail/cat/echo），非白名单命令直接抛错。连接参数自动从 `~/.ssh/config` 解析 Username，使用 SSH agent 认证。断线后每 30 秒重试，最多 5 次。IPC 通道：`ssh:status`、`ssh:test-connection`。Header 组件每 5 秒轮询显示绿/橙/红状态点，带旋转刷新按钮。

---

### Phase 2 — Job 看板
- **状态**：✅ 已完成
- **完成时间**：2026-03-03
- **备注**：`job-parser.ts` 实现防御性 GPU TRES 解析（支持 gpu:N / gres/gpu:N / gres/gpu:model:N / 完整 TRES 字符串）。IPC `jobs:get-all` 执行 squeue 并返回 Job 数组。JobBoard 每 30 秒轮询，显示 loading skeleton / 空状态 / 错误横幅。JobCard 显示状态点颜色、GPU 信息、时长；`复制 scancel` 按钮 1.5 秒反馈。Tray badge 通过 `tray:update-badge` IPC 实时联动。

---

### Phase 3 — WandB 通知 & 概览
- **状态**：✅ 已完成
- **完成时间**：2026-03-03
- **备注**：`wandb-service.ts` 实现 5 分钟轮询、状态变化通知（finished/crashed/killed 防重复）、rate limit 退避。API Key 存 macOS Keychain（keytar）。内联 SetupForm 初始配置。Run 卡片显示状态图标、主 metric（val/best_pred_top1 → val/top1 → val/top5 优先级）、时长、相对时间。Entity: pheonizard-university-of-nottingham，Project: HPC-SIRSID。

---

### Phase 4 — 日志查看器
- **状态**：✅ 已完成
- **完成时间**：2026-03-03
- **备注**：`log-streamer.ts` 独立 NodeSSH 连接做 tail -f streaming，通过 IPC event 推行到渲染进程。最多保留 500 行，Popover blur 时自动断开。LogViewer 组件：深色固定背景，自动滚动/暂停，文件路径输入框（文件不存在时出现），复制路径按钮。JobBoard 管理 expandedJobId 确保同时只展开一个日志面板。

---

### Phase 5 — 存储配额 + 快速命令面板
- **状态**：✅ 已完成
- **完成时间**：2026-03-03
- **备注**：`storage-service.ts` 解析 `quota -s` 和 `du -sh`，scratch 路径动态读取 SSH username（`/scratch/users/<username>`）。StorageWidget 进度条三色阈值。QuickCommands 默认折叠，6 条内置命令 + 自定义命令（electron-store 持久化，右键删除）。

---

### Phase 6 — 偏好设置面板
- **状态**：✅ 已完成
- **完成时间**：2026-03-03
- **备注**：Preferences 作为 Popover 内二级视图（⚙ 按钮切换，← 返回）。SSH/WandB/轮询/通知/存储配置一体化管理。敏感信息（WandB API Key）存 Keychain，其余存 electron-store。WandB 连接测试按钮。所有设置实时保存（blur/onChange）。

---

### Phase 7 — 论文进度 Widget
- **状态**：⬜ 未开始
- **备注**：—

---

### Phase 8 — Markdown 阅览器（P2）
- **状态**：⬜ 未开始
- **备注**：—

---

### Phase 9 — 打包 & 收尾
- **状态**：⬜ 未开始
- **备注**：—
