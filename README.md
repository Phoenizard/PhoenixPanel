# PhoenixPanel

A macOS menu bar app for monitoring SLURM jobs and WandB experiments on KCL HPC.

![icon](phoenixpanel-appicon.svg)

---

## Features

- **Job Board** — Live SLURM job status via `squeue`, with GPU info, runtime, and training epoch progress parsed from logs
- **WandB Monitor** — Polls your WandB project every 2 minutes, displays key metrics (top-1/top-5 accuracy) per run
- **Notifications** — macOS native alerts when a job completes, fails, or a WandB run finishes/crashes
- **Log Viewer** — Stream job logs in real-time (`tail -f`) directly in the panel
- **Quick Commands** — One-click copy for common HPC commands; supports custom entries
- **CLI Interface** — Query live status from any terminal (including Claude Code) while the app is running

**Read-only by design** — the app never writes to or executes anything on the remote cluster. All "run" actions copy commands to clipboard only.

---

## Requirements

- macOS 12+
- SSH access to KCL HPC (`create` host alias in `~/.ssh/config`)
- WandB account with API key

---

## Installation

1. Download `PhoenixPanel-arm64.dmg` (Apple Silicon) from [Releases](https://github.com/Phoenizard/PhoenixPanel/releases)
2. Open the dmg and drag PhoenixPanel to Applications
3. Right-click → Open on first launch (bypasses Gatekeeper for unsigned builds)
4. Click the menu bar icon and configure SSH host + WandB API key in Preferences (⚙)

---

## CLI Tool

While PhoenixPanel is running, install the `phoenix` CLI for terminal queries:

```bash
cd /path/to/PhoenixPanel
npm run install-cli
```

Then from any terminal:

```bash
phoenix
```

Output example:
```
━━━  SLURM Jobs  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ● train_sirsid_v3              #12345678    4:12:03  GPU 4× a100

━━━  WandB Runs  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (updated 1m ago)
  ⏳ sirsid-run-42               4h 12m   top1: 30.21%
```

---

## SSH Config

The app reads `~/.ssh/config` automatically. Recommended setup:

```
Host create
    HostName hpc.create.kcl.ac.uk
    User k-number
    IdentityFile ~/.ssh/id_rsa
```

---

## Development

```bash
npm install
npm run dev
```

**Stack:** Electron + React + TypeScript, vite-plugin-electron

**Build DMG:**
```bash
npm run build
# Output: dist/PhoenixPanel-*-arm64.dmg
```

---

## SSH Command Whitelist

Only the following commands are permitted over SSH:

`squeue` · `sacct` · `quota` · `df` · `du` · `tail` · `cat` · `echo`

---

## License

MIT
