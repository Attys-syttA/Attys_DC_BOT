Status: done / operator tools preflight implemented

## Cel

- A bot desktop shortcutbol es tray panelbol inditva VS Code nelkul is probalja elokesziteni azokat a helyi eszkozoket, amelyek a normal kozos munka soran hasznosak.
- A megoldas epuljon a mar letezo `codex-ai-tools-mcp-link` workspace launcherre, ne duplikalja annak teljes logikajat.

## Elkeszult reszek

- `scripts/operator-startup.ps1` bekerult.
- A script sibling `codex-ai-tools-mcp-link` repot keres a `codex_works` root alatt.
- Ha megtalalja, a kozos launchert futtatja:
  - `-WorkspaceName Attys_DC_BOT`
  - `-SkipTelegramBot`
  - `-SkipVsCode`
  - `-HealthTimeoutSec 45`
- A preflight celja:
  - sajat local MCP inditasa es ellenorzese
  - Docker Desktop inditasa, ha elerheto
  - Obsidian inditasa es MCP ellenorzese
- Ha a sibling launcher nincs meg, az eredmeny `skipped`, nem hard failure.
- `win-start.bat` a bot inditasa elott futtatja a preflightot.
- A tray panel kapott `Tools` gombot manualis preflight futtatasra.
- A tray start/restart is atadja az operator tools statuszt a bot indulasi kornyezetebe.
- A startup Discord notification `operator tools: ready|failed|skipped|running|unknown` mezot kapott.
- A `/tools run|status` Discord parancs bekerult.
- A `/tools` parancs csak a helyi `operator-startup.log` public-safe status sorait kuldi vissza, nem a teljes PowerShell kimenetet.
- A `/dashboard` mutatja az utolso operator tools status sort.
- A preflight ignored `.discord-bot-state` lockot hasznal, igy parhuzamos startup/tray/Discord futtatas helyett `RUNNING` allapotot ad.
- A `/tools` valasz csak a legutobbi rovid public-safe status blokkot mutatja.

## Validacio

- `npm run check`
- C# tray build
- `git diff --check`
- `ggshield secret scan path --recursive --yes --use-gitignore .`
- Manual smoke: `scripts/operator-startup.ps1` a helyi gepen.
- Targeted tests: `src/bot/commands/tools.test.ts`.

## Nyitott reszek

- Docker daemon-level readiness varakozas kulon jovobeli bovites lehet; a jelenlegi shared launcher Docker Desktop inditast ad ki.
- Serena stdio MCP explicit kulon kezelese nincs a bot launcherbe epitve, mert azt normal esetben a Codex MCP host inditja.
