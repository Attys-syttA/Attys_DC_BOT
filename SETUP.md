# Setup

This setup is for one Windows machine: Discord bot, Codex CLI, Git, and repositories all live on the same PC.

## 1. Install Prerequisites

- Node.js 20+
- Codex CLI
- Git

Log in to Codex locally:

```powershell
codex.cmd login
codex.cmd login status
```

## 2. Configure Discord

Create a Discord application and bot in the Discord Developer Portal.

Required values for `.env`:

- bot token
- application/server information needed by Discord command registration
- your allowed Discord user ID

Enable Message Content Intent only if normal Discord messages should be accepted as prompts. Slash commands remain the safer default control surface.

## 3. Create Local Config

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` locally. Use a narrow workspace root such as `C:\workspace`. Do not use your whole home directory as the base.

Do not commit:

- `.env`
- Discord token
- Codex auth state
- GitHub token
- real Discord IDs in docs/tests/examples
- local runtime SQLite files

## 4. Start

```powershell
npm run build
npm start
```

Development mode:

```powershell
npm run dev
```

## 5. First Discord Flow

1. In a Discord channel, run `/register`.
2. Select or type a folder under `BASE_PROJECT_DIR`.
3. Send a normal message or use the available slash commands.
4. Use `/sessions`, `/last`, `/queue list`, and `/stop` to inspect or control the local Codex work.

## 6. Validate Before Commit

```powershell
npm run typecheck
npm test
npm run build
npm run check
ggshield secret scan path --recursive --yes --use-gitignore .
```

No `git push` should happen until the local-first cleanup and secret scan are reviewed.
