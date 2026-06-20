Status: done / operator lifecycle notifications implemented

## Cel

- A Discord startup es lifecycle uzenet legyen operator szempontbol hasznosabb, kulonosen paneles restart, launcher start es stop eseten.
- Az uzenet maradjon public-safe: ne tartalmazzon tokent, raw Discord ID-t, privat pathot vagy lokal usernevet.

## Elkeszult reszek

- A startup notification Attys brandinget hasznal.
- Az uzenet tartalmazza:
  - launch reason
  - bot user tag
  - message prompt mode
  - slash command registration allapot
  - loaded slash command count
- A Windows launcher `windows-launcher` es `windows-foreground` launch reasont ad at.
- A Windows tray `windows-tray-start`, `windows-tray-restart` es `windows-safe-update` launch reasont ad at.
- Ismeretlen launch reason eseten generikus `manual or external start` jelenik meg, nem a nyers bemenet.
- A Discord.js startup handler `ready` helyett `clientReady` esemenyt hasznal.
- Kulon lifecycle notifier CLI keszult stop/restart elotti uzenetekhez.
- A Windows launcher csak akkor kuld stop/restart lifecycle uzenetet, ha a bot tenylegesen fut.
- A tray stop, tray restart es safe update restart elott best-effort lifecycle notification fut; hiba eseten nem blokkolja a helyi stop/restart muveletet.

## Validacio

- Notification unit test frissitve.
- C# tray build frissitve.
- Teljes `npm run check` zold.
- `git diff --check` zold.

## Nyitott reszek

- Shutdown kozbeni graceful Discord kliens close nincs bevezetve; a stop uzenet kulon CLI-n keresztul, a folyamat kilovese elott megy ki.
