# Source Parity Matrix

Reference source:

- `chadingTV/codex-discord`
- Reviewed commit: `dc1afb8`

Status labels:

- `implemented`: same capability exists in this repository.
- `implemented differently`: capability exists, but Attys safety or local-first choices changed the implementation.
- `future work`: intentionally left for a later slice or real platform acceptance.
- `not included`: intentionally excluded.

| Area | Source capability | Attys status | Notes |
|---|---|---|---|
| Windows launcher | Batch launcher and tray lifecycle | implemented differently | `win-start.bat` and `tray/CodexBotTray.cs` are repo-scoped, status-aware, and include operator tools preflight. |
| Linux launcher | `linux-start.sh` with `systemd --user` | implemented | `linux-start.sh` uses `systemd --user` with `nohup` fallback and repo-local logs. |
| macOS launcher | `mac-start.sh` with `launchd` | implemented | `mac-start.sh` writes launchd plist and shares local `.env`, `bot.log`, and `bot.err.log`. |
| Linux tray | Python tray app | implemented differently | `tray/codex_tray.py` is Attys-branded, uses `linux-start.sh`, and keeps update actions read-only. |
| Linux control panel | Python Tk control panel | implemented differently | `tray/codex_control_panel.py` is Attys-branded and routes lifecycle through the launcher. |
| macOS menu bar | Swift menu bar app | implemented differently | `menubar/CodexBotMenu.swift` is Attys-branded, shares `mac-start.sh`/launchd contract, and keeps update actions read-only. |
| Usage cache | `~/.codex/rate-limits-cache.json` | implemented | `/usage`, Windows panel, Linux panel, and macOS menu bar use the same cache shape. |
| Usage app-server refresh | Codex app-server JSON-RPC | implemented | Canonical TS helpers normalize live results and cache payloads. Desktop panels implement platform-local refreshers. |
| Slash commands | Discord slash command surface | implemented differently | Attys has additional `/health`, `/events`, `/logs`, `/doctor`, `/dashboard`, `/tools`, and safety-gated commands. |
| Message attachments | Normal Discord attachment prompt flow | implemented differently | `DISCORD_ENABLE_ATTACHMENT_MESSAGES=false` by default; opt-in normal text+attachment messages are supported. |
| Explicit file handoff | Source repo normal flow only | implemented beyond source | `Send to Codex` message command supports iPad/phone file handoff without enabling normal message prompts. |
| Promptless attachment handling | Source may process file prompt directly | implemented differently | Attys refuses blind attachment-only work and asks for a written instruction or `Send to Codex`. |
| Auto-update | Tray auto-update | implemented differently | Cross-platform `safe-update:status/apply` is clean-only, ff-only, no stash/reset. Desktop update actions remain conservative. |
| Public-safe diagnostics | Basic logs/status | implemented beyond source | `/health`, `/events`, scrubbed `/logs`, notification channel, and public-safe docs/assets are included. |
| Korean docs | `docs/README.kr.md`, `docs/SETUP.kr.md` | not included | Attys audience is English public docs plus Hungarian `/sugo`; full localization is future work only if requested. |
| Linux GUI runtime smoke | Real Linux desktop tray smoke | future work | Requires a Linux desktop session with tray dependencies. |
| macOS Swift runtime smoke | Real macOS menu bar smoke | future work | Requires macOS with Xcode Command Line Tools. |
| iPad/mobile Discord smoke | Remote operator acceptance | future work | Requires the user's Discord client and live bot/server context. |
