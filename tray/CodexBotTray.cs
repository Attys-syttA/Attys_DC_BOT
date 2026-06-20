using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Management;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class CodexBotTray : Form
{
    private static readonly string[] EnvKeys = new string[]
    {
        "DISCORD_BOT_TOKEN",
        "DISCORD_APPLICATION_ID",
        "DISCORD_GUILD_ID",
        "DISCORD_NOTIFICATION_CHANNEL_ID",
        "ALLOWED_USER_IDS",
        "ALLOWED_ROLE_IDS",
        "BASE_PROJECT_DIR",
        "DISCORD_DATABASE_PATH",
        "DISCORD_SESSION_STORE_PATH",
        "RATE_LIMIT_PER_MINUTE",
        "DISCORD_QUEUE_MAX_ITEMS",
        "DISCORD_ENABLE_MESSAGE_PROMPTS",
        "DISCORD_ENABLE_ATTACHMENT_MESSAGES",
        "DISCORD_EPHEMERAL_RESPONSES",
        "SHOW_COST",
        "DISCORD_REGISTER_COMMANDS",
        "DISCORD_ENABLE_RUN_TESTS",
        "DISCORD_ENABLE_AUTO_APPROVE",
        "DISCORD_ENABLE_SESSION_DELETE",
        "DISCORD_ENABLE_BOT_LIFECYCLE"
    };

    private readonly string botDir;
    private readonly string envPath;
    private readonly string lockPath;
    private readonly string logPath;
    private readonly string errorLogPath;
    private readonly string trayErrorLogPath;
    private readonly string botExePath;
    private readonly string usageCachePath;
    private readonly string runtimeCachePath;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private readonly Timer refreshTimer = new Timer();

    private NotifyIcon trayIcon;
    private Form controlPanel;
    private Label statusLabel;
    private Panel statusDot;
    private Panel lifecyclePanel;
    private Panel usagePanel;
    private Label usageStatusLabel;
    private DateTime lastUsageRefresh = DateTime.MinValue;
    private Dictionary<string, object> usageData;
    private long usageFetchedAt;

    private sealed class CommandResult
    {
        public int ExitCode;
        public string Output;
        public string Error;
        public bool TimedOut;
    }

    private sealed class GitSnapshot
    {
        public string Version = "unknown";
        public string Status = "Git unavailable";
        public string Detail = "";
        public string LocalCommit = "unknown";
        public string UpstreamName = "origin/main";
        public string UpstreamCommit = "unknown";
        public int Ahead;
        public int Behind;
        public bool Dirty;
        public bool GitAvailable;
        public bool FetchFailed;
        public string FetchMessage = "";
        public bool CanSafeUpdate
        {
            get { return GitAvailable && !Dirty && Behind > 0 && Ahead == 0; }
        }
    }

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.ThreadException += delegate(object sender, System.Threading.ThreadExceptionEventArgs e)
        {
            WriteCrashLog(e.Exception);
        };
        AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e)
        {
            WriteCrashLog(e.ExceptionObject as Exception);
        };
        Application.Run(new CodexBotTray(args));
    }

    private CodexBotTray(string[] args)
    {
        botDir = ResolveBotDirectory();
        envPath = Path.Combine(botDir, ".env");
        lockPath = Path.Combine(botDir, ".bot.lock");
        logPath = Path.Combine(botDir, "bot.log");
        errorLogPath = Path.Combine(botDir, "bot.err.log");
        trayErrorLogPath = Path.Combine(botDir, "tray-error.log");
        botExePath = Path.Combine(botDir, "CodexBot.exe");
        usageCachePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".codex",
            "rate-limits-cache.json");
        runtimeCachePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".codex",
            "codex-discord-runtime.json");

        WindowState = FormWindowState.Minimized;
        ShowInTaskbar = false;
        Visible = false;

        trayIcon = new NotifyIcon();
        trayIcon.Text = "Attys DC BOT";
        trayIcon.Icon = SystemIcons.Application;
        trayIcon.Visible = true;
        trayIcon.DoubleClick += delegate { SafeShowControlPanel(); };
        trayIcon.MouseClick += delegate(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left) SafeShowControlPanel();
        };

        LoadUsageCache();
        BuildMenu();

        refreshTimer.Interval = 3000;
        refreshTimer.Tick += delegate
        {
            try
            {
                CleanupStaleLock();
                UpdateStatus();
                BuildMenu();
            }
            catch
            {
                // Keep the tray alive even if a transient WMI/UI refresh fails.
            }
        };
        refreshTimer.Start();

        if (args != null && Array.IndexOf(args, "--show") >= 0)
        {
            Timer startupShowTimer = new Timer();
            startupShowTimer.Interval = 250;
            startupShowTimer.Tick += delegate
            {
                startupShowTimer.Stop();
                startupShowTimer.Dispose();
                SafeShowControlPanel();
            };
            startupShowTimer.Start();
        }
    }

    protected override void SetVisibleCore(bool value)
    {
        base.SetVisibleCore(false);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            refreshTimer.Dispose();
        }
        base.Dispose(disposing);
    }

    private static string ResolveBotDirectory()
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string leaf = Path.GetFileName(baseDir);
        if (string.Equals(leaf, "tray", StringComparison.OrdinalIgnoreCase))
        {
            DirectoryInfo parent = Directory.GetParent(baseDir);
            if (parent != null) return parent.FullName;
        }
        return baseDir;
    }

    private void BuildMenu()
    {
        ContextMenuStrip menu = new ContextMenuStrip();
        bool running = IsRunning();
        menu.Items.Add(running ? "Status: Running" : "Status: Stopped").Enabled = false;
        menu.Items.Add("-");
        if (running)
        {
            menu.Items.Add("Stop Bot", null, delegate { StopBot(); });
            menu.Items.Add("Restart Bot", null, delegate { RestartBot(); });
        }
        else
        {
            menu.Items.Add("Start Bot", null, delegate { StartBot(true); });
        }
        menu.Items.Add("Control Panel", null, delegate { SafeShowControlPanel(); });
        menu.Items.Add("Settings...", null, delegate { OpenSettings(); });
        menu.Items.Add("View Log", null, delegate { OpenLog(); });
        menu.Items.Add("Open Folder", null, delegate { OpenFolder(); });
        menu.Items.Add("-");
        menu.Items.Add("Exit Tray", null, delegate { ExitTray(); });
        trayIcon.ContextMenuStrip = menu;
        trayIcon.Text = running ? "Attys DC BOT - Running" : "Attys DC BOT - Stopped";
    }

    private void ShowControlPanel()
    {
        if (controlPanel != null && !controlPanel.IsDisposed)
        {
            controlPanel.Activate();
            RebuildControlPanel();
            return;
        }

        controlPanel = new Form();
        controlPanel.Text = "Attys DC BOT Control Panel";
        controlPanel.StartPosition = FormStartPosition.CenterScreen;
        controlPanel.Size = new Size(640, 760);
        controlPanel.MinimumSize = new Size(600, 660);
        controlPanel.BackColor = Color.FromArgb(24, 28, 36);
        controlPanel.ForeColor = Color.White;
        controlPanel.FormClosed += delegate { controlPanel = null; };
        RebuildControlPanel();
        controlPanel.Show();
        controlPanel.Activate();
    }

    private void SafeShowControlPanel()
    {
        try
        {
            ShowControlPanel();
        }
        catch (Exception ex)
        {
            WriteCrashLog(ex);
        }
    }

    private static void WriteCrashLog(Exception ex)
    {
        try
        {
            string baseDir = ResolveBotDirectory();
            string path = Path.Combine(baseDir, "tray-error.log");
            string text = DateTime.Now.ToString("s", CultureInfo.InvariantCulture)
                + " "
                + (ex == null ? "Unknown tray error" : ex.ToString())
                + Environment.NewLine;
            File.AppendAllText(path, text, new UTF8Encoding(false));
        }
        catch
        {
        }
    }

    private void RebuildControlPanel()
    {
        if (controlPanel == null || controlPanel.IsDisposed) return;
        controlPanel.Controls.Clear();

        Label title = MakeLabel("Attys DC BOT", 24, 22, 340, 30, 18, FontStyle.Bold);
        controlPanel.Controls.Add(title);

        statusDot = new Panel();
        statusDot.Left = 25;
        statusDot.Top = 70;
        statusDot.Width = 16;
        statusDot.Height = 16;
        controlPanel.Controls.Add(statusDot);

        statusLabel = MakeLabel("", 50, 66, 420, 26, 11, FontStyle.Bold);
        controlPanel.Controls.Add(statusLabel);

        int y = 108;
        Button startStop = MakeButton(IsRunning() ? "Stop" : "Start", 25, y, 140, 42);
        startStop.Click += delegate
        {
            if (IsRunning()) StopBot("windows-tray-stop"); else StartBot(true, "windows-tray-start");
            RebuildControlPanel();
        };
        controlPanel.Controls.Add(startStop);

        Button restart = MakeButton("Restart", 185, y, 140, 42);
        restart.Click += delegate { RestartBot("windows-tray-restart"); RebuildControlPanel(); };
        controlPanel.Controls.Add(restart);

        Button settings = MakeButton("Settings", 345, y, 140, 42);
        settings.Click += delegate { OpenSettings(); RebuildControlPanel(); };
        controlPanel.Controls.Add(settings);

        y += 58;
        Button log = MakeButton("Open Log", 25, y, 140, 42);
        log.Click += delegate { OpenLog(); };
        controlPanel.Controls.Add(log);

        Button folder = MakeButton("Open Folder", 185, y, 140, 42);
        folder.Click += delegate { OpenFolder(); };
        controlPanel.Controls.Add(folder);

        Button refreshUsage = MakeButton("Refresh Usage", 345, y, 140, 42);
        refreshUsage.Click += delegate { RefreshUsage(true); };
        controlPanel.Controls.Add(refreshUsage);

        y += 58;
        lifecyclePanel = new Panel();
        lifecyclePanel.Left = 25;
        lifecyclePanel.Top = y;
        lifecyclePanel.Width = controlPanel.ClientSize.Width - 50;
        lifecyclePanel.Height = 184;
        lifecyclePanel.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
        lifecyclePanel.BackColor = Color.FromArgb(31, 36, 46);
        controlPanel.Controls.Add(lifecyclePanel);
        RenderLifecyclePanel(false);

        y += 202;
        usageStatusLabel = MakeLabel("", 25, y, 450, 22, 10, FontStyle.Regular);
        controlPanel.Controls.Add(usageStatusLabel);

        usagePanel = new Panel();
        usagePanel.Left = 25;
        usagePanel.Top = y + 30;
        usagePanel.Width = controlPanel.ClientSize.Width - 50;
        usagePanel.Height = controlPanel.ClientSize.Height - y - 58;
        usagePanel.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right | AnchorStyles.Bottom;
        usagePanel.BackColor = Color.FromArgb(31, 36, 46);
        controlPanel.Controls.Add(usagePanel);

        LinkLabel usageLink = new LinkLabel();
        usageLink.Text = "Open Codex usage settings";
        usageLink.Left = 25;
        usageLink.Top = controlPanel.ClientSize.Height - 32;
        usageLink.Width = 220;
        usageLink.Anchor = AnchorStyles.Left | AnchorStyles.Bottom;
        usageLink.LinkColor = Color.FromArgb(125, 190, 255);
        usageLink.BackColor = Color.Transparent;
        usageLink.LinkClicked += delegate { OpenUrl("https://chatgpt.com/codex/settings/usage"); };
        controlPanel.Controls.Add(usageLink);

        UpdateStatus();
        RenderUsagePanel();
    }

    private void RenderLifecyclePanel(bool fetch)
    {
        if (lifecyclePanel == null || lifecyclePanel.IsDisposed) return;
        lifecyclePanel.Controls.Clear();

        GitSnapshot snapshot = GetGitSnapshot(fetch);
        Label title = MakeLabel("Desktop lifecycle", 14, 12, lifecyclePanel.Width - 28, 22, 10, FontStyle.Bold);
        title.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
        lifecyclePanel.Controls.Add(title);

        Label version = MakeLabel(
            "Version: " + snapshot.Version + "  |  Local: " + snapshot.LocalCommit + "  |  Upstream: " + snapshot.UpstreamCommit,
            14,
            38,
            lifecyclePanel.Width - 28,
            20,
            9,
            FontStyle.Regular);
        version.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
        version.ForeColor = Color.FromArgb(210, 220, 235);
        lifecyclePanel.Controls.Add(version);

        Label repo = MakeLabel(
            "Repository: " + snapshot.Status,
            14,
            62,
            lifecyclePanel.Width - 28,
            22,
            10,
            FontStyle.Bold);
        repo.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
        repo.ForeColor = snapshot.Behind > 0 ? Color.FromArgb(245, 158, 11) : snapshot.Dirty ? Color.FromArgb(250, 204, 21) : Color.FromArgb(16, 185, 129);
        lifecyclePanel.Controls.Add(repo);

        Label detail = MakeLabel(snapshot.Detail, 14, 86, lifecyclePanel.Width - 28, 20, 9, FontStyle.Regular);
        detail.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
        detail.ForeColor = Color.FromArgb(180, 190, 205);
        lifecyclePanel.Controls.Add(detail);

        Button check = MakeButton("Check Updates", 14, 114, 122, 30);
        check.Font = new Font("Segoe UI", 8, FontStyle.Bold);
        check.Click += delegate { RenderLifecyclePanel(true); };
        lifecyclePanel.Controls.Add(check);

        Button github = MakeButton("GitHub", 146, 114, 86, 30);
        github.Font = new Font("Segoe UI", 8, FontStyle.Bold);
        github.Click += delegate { OpenUrl("https://github.com/Attys-syttA/Attys_DC_BOT"); };
        lifecyclePanel.Controls.Add(github);

        Button releases = MakeButton("Releases", 242, 114, 86, 30);
        releases.Font = new Font("Segoe UI", 8, FontStyle.Bold);
        releases.Click += delegate { OpenUrl("https://github.com/Attys-syttA/Attys_DC_BOT/releases"); };
        lifecyclePanel.Controls.Add(releases);

        Button safeUpdate = MakeButton("Safe Update", 338, 114, 94, 30);
        safeUpdate.Font = new Font("Segoe UI", 8, FontStyle.Bold);
        safeUpdate.Enabled = snapshot.CanSafeUpdate;
        safeUpdate.BackColor = snapshot.CanSafeUpdate ? Color.FromArgb(55, 110, 80) : Color.FromArgb(55, 58, 66);
        safeUpdate.Click += delegate
        {
            RunSafeUpdateFromPanel();
            RenderLifecyclePanel(false);
        };
        lifecyclePanel.Controls.Add(safeUpdate);

        Button setup = MakeButton("Setup", 440, 114, 62, 30);
        setup.Font = new Font("Segoe UI", 8, FontStyle.Bold);
        setup.Click += delegate { OpenLocalFile(Path.Combine(botDir, "SETUP.md")); };
        lifecyclePanel.Controls.Add(setup);

        Button tools = MakeButton("Tools", 510, 114, 62, 30);
        tools.Font = new Font("Segoe UI", 8, FontStyle.Bold);
        tools.Click += delegate { PrepareOperatorTools(true); };
        lifecyclePanel.Controls.Add(tools);

        CheckBox autostart = new CheckBox();
        autostart.Text = "Launch on login";
        autostart.Left = 14;
        autostart.Top = 150;
        autostart.Width = lifecyclePanel.Width - 28;
        autostart.Height = 22;
        autostart.Anchor = AnchorStyles.Left | AnchorStyles.Top;
        autostart.ForeColor = Color.White;
        autostart.BackColor = Color.Transparent;
        autostart.Checked = IsAutostartEnabled();
        autostart.CheckedChanged += delegate
        {
            try
            {
                SetAutostartEnabled(autostart.Checked);
            }
            catch (Exception ex)
            {
                autostart.CheckedChanged -= delegate { };
                MessageBox.Show(
                    "Could not change Windows startup setting. Open the Startup folder and create/remove the shortcut manually.\n\n" + SafeError(ex.Message),
                    "Autostart",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                OpenStartupFolder();
                RenderLifecyclePanel(false);
            }
        };
        lifecyclePanel.Controls.Add(autostart);

        if (snapshot.FetchFailed)
        {
            MessageBox.Show(snapshot.FetchMessage, "Check for Updates", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private Label MakeLabel(string text, int left, int top, int width, int height, int size, FontStyle style)
    {
        Label label = new Label();
        label.Text = text;
        label.Left = left;
        label.Top = top;
        label.Width = width;
        label.Height = height;
        label.Font = new Font("Segoe UI", size, style);
        label.ForeColor = Color.White;
        label.BackColor = Color.Transparent;
        return label;
    }

    private Button MakeButton(string text, int left, int top, int width, int height)
    {
        Button button = new Button();
        button.Text = text;
        button.Left = left;
        button.Top = top;
        button.Width = width;
        button.Height = height;
        button.FlatStyle = FlatStyle.Flat;
        button.BackColor = Color.FromArgb(45, 58, 78);
        button.ForeColor = Color.White;
        button.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        return button;
    }

    private void UpdateStatus()
    {
        bool running = IsRunning();
        if (statusLabel != null)
        {
            statusLabel.Text = running ? "Bot status: Running" : "Bot status: Stopped";
        }
        if (statusDot != null)
        {
            statusDot.BackColor = running ? Color.FromArgb(16, 185, 129) : Color.FromArgb(239, 68, 68);
        }
    }

    private bool IsRunning()
    {
        CleanupStaleLock();
        return GetBotProcessIds().Count > 0;
    }

    private List<int> GetBotProcessIds()
    {
        List<int> ids = new List<int>();
        try
        {
            using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(
                "SELECT ProcessId, Name, CommandLine FROM Win32_Process WHERE Name='node.exe' OR Name='CodexBot.exe'"))
            {
                foreach (ManagementObject item in searcher.Get())
                {
                    string commandLine = Convert.ToString(item["CommandLine"], CultureInfo.InvariantCulture);
                    if (IsBotCommandLine(commandLine))
                    {
                        ids.Add(Convert.ToInt32(item["ProcessId"], CultureInfo.InvariantCulture));
                    }
                }
            }
        }
        catch
        {
            // Process inspection can fail under restrictive local policies.
        }
        int lockedId = GetValidLockedProcessId();
        if (lockedId > 0 && !ids.Contains(lockedId)) ids.Add(lockedId);
        return ids;
    }

    private bool IsBotCommandLine(string commandLine)
    {
        if (string.IsNullOrEmpty(commandLine)) return false;
        string normalized = commandLine.Replace('/', '\\');
        string normalizedDir = botDir.Replace('/', '\\');
        return normalized.IndexOf(normalizedDir, StringComparison.OrdinalIgnoreCase) >= 0
            && normalized.IndexOf("dist\\index.js", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private int GetValidLockedProcessId()
    {
        try
        {
            if (!File.Exists(lockPath)) return 0;
            int lockPid;
            if (!int.TryParse(File.ReadAllText(lockPath).Trim(), out lockPid)) return 0;
            using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(
                "SELECT ProcessId, Name, CommandLine FROM Win32_Process WHERE ProcessId=" + lockPid.ToString(CultureInfo.InvariantCulture)))
            {
                foreach (ManagementObject item in searcher.Get())
                {
                    string name = Convert.ToString(item["Name"], CultureInfo.InvariantCulture);
                    string commandLine = Convert.ToString(item["CommandLine"], CultureInfo.InvariantCulture).Replace('/', '\\');
                    bool botProcess = string.Equals(name, "node.exe", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(name, "CodexBot.exe", StringComparison.OrdinalIgnoreCase);
                    if (botProcess && commandLine.IndexOf("dist\\index.js", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        return lockPid;
                    }
                }
            }
        }
        catch
        {
        }
        return 0;
    }

    private void CleanupStaleLock()
    {
        try
        {
            if (!File.Exists(lockPath)) return;
            string raw = File.ReadAllText(lockPath).Trim();
            int lockPid;
            if (!int.TryParse(raw, out lockPid))
            {
                File.Delete(lockPath);
                return;
            }
            if (GetValidLockedProcessId() != lockPid && !GetBotProcessIds().Contains(lockPid))
            {
                File.Delete(lockPath);
            }
        }
        catch
        {
            // Keep UI responsive even if the lock file is momentarily busy.
        }
    }

    private void StartBot(bool showErrors)
    {
        StartBot(showErrors, "windows-tray-start");
    }

    private void StartBot(bool showErrors, string launchReason)
    {
        if (IsRunning())
        {
            UpdateStatus();
            return;
        }
        if (!File.Exists(Path.Combine(botDir, "dist", "index.js")))
        {
            if (showErrors) MessageBox.Show("dist/index.js is missing. Run npm run build first.", "Cannot Start Bot", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (!File.Exists(envPath))
        {
            if (showErrors) MessageBox.Show(".env is missing. Open Settings and save local configuration first.", "Configuration Missing", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        string operatorToolsStatus = PrepareOperatorTools(false);
        string runner = File.Exists(botExePath) ? botExePath : "node";
        string entry = Path.Combine(botDir, "dist", "index.js");
        string command = "cd /d " + Quote(botDir)
            + " && set ATTYS_BOT_LAUNCH_REASON=" + launchReason
            + " && set ATTYS_OPERATOR_TOOLS_STATUS=" + operatorToolsStatus
            + " && " + Quote(runner) + " " + Quote(entry)
            + " >> " + Quote(logPath) + " 2>> " + Quote(errorLogPath);
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = "cmd.exe";
        info.Arguments = "/c " + command;
        info.WorkingDirectory = botDir;
        info.WindowStyle = ProcessWindowStyle.Hidden;
        info.CreateNoWindow = true;
        Process.Start(info);
        System.Threading.Thread.Sleep(800);
        UpdateStatus();
        BuildMenu();
    }

    private void StopBot()
    {
        StopBot("windows-tray-stop");
    }

    private void StopBot(string lifecycleEvent)
    {
        SendLifecycleNotification(lifecycleEvent);
        foreach (int id in GetBotProcessIds())
        {
            try
            {
                Process process = Process.GetProcessById(id);
                process.Kill();
                process.WaitForExit(3000);
            }
            catch
            {
                // Ignore already-exited processes.
            }
        }
        try { if (File.Exists(lockPath)) File.Delete(lockPath); } catch { }
        UpdateStatus();
        BuildMenu();
    }

    private void SendLifecycleNotification(string lifecycleEvent)
    {
        try
        {
            string tsx = Path.Combine(botDir, "node_modules", ".bin", "tsx.cmd");
            string script = Path.Combine(botDir, "src", "cli", "lifecycle-notify.ts");
            if (!File.Exists(tsx) || !File.Exists(script)) return;
            RunCommand("cmd.exe", "/c " + Quote(tsx) + " " + Quote(script) + " " + lifecycleEvent, 15000);
        }
        catch
        {
            // Lifecycle notification must never block local stop/restart.
        }
    }

    private string PrepareOperatorTools(bool showResult)
    {
        try
        {
            string script = Path.Combine(botDir, "scripts", "operator-startup.ps1");
            if (!File.Exists(script))
            {
                if (showResult) MessageBox.Show("Operator startup script is not available.", "Operator Tools", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return "skipped";
            }

            CommandResult result = RunCommand("powershell", "-NoProfile -ExecutionPolicy Bypass -File " + Quote(script), 90000);
            if (result.ExitCode == 0)
            {
                if (showResult) MessageBox.Show("Operator tools are ready.", "Operator Tools", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return "ready";
            }
            if (result.ExitCode == 2)
            {
                if (showResult) MessageBox.Show("Operator tools were skipped because the shared launcher was not found.", "Operator Tools", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return "skipped";
            }
            if (result.ExitCode == 3)
            {
                if (showResult) MessageBox.Show("Operator tools preflight is already running.", "Operator Tools", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return "running";
            }
            if (showResult) MessageBox.Show("Operator tools preflight failed. Check operator-startup.log.", "Operator Tools", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return "failed";
        }
        catch
        {
            if (showResult) MessageBox.Show("Operator tools preflight failed. Check operator-startup.log.", "Operator Tools", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return "failed";
        }
    }

    private void RestartBot()
    {
        RestartBot("windows-tray-restart");
    }

    private void RestartBot(string launchReason)
    {
        StopBot(launchReason == "windows-safe-update" ? "windows-safe-update-stop" : "windows-tray-restart");
        StartBot(true, launchReason);
    }

    private void OpenSettings()
    {
        Form form = new Form();
        form.Text = "Attys DC BOT Settings";
        form.StartPosition = FormStartPosition.CenterParent;
        form.Size = new Size(760, 640);
        form.MinimumSize = new Size(680, 560);
        form.BackColor = Color.FromArgb(24, 28, 36);
        form.ForeColor = Color.White;

        Dictionary<string, string> env = ReadEnvFile();
        Dictionary<string, TextBox> boxes = new Dictionary<string, TextBox>();
        Panel panel = new Panel();
        panel.Left = 12;
        panel.Top = 12;
        panel.Width = form.ClientSize.Width - 24;
        panel.Height = form.ClientSize.Height - 78;
        panel.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top | AnchorStyles.Bottom;
        panel.AutoScroll = true;
        panel.BackColor = Color.FromArgb(31, 36, 46);
        form.Controls.Add(panel);

        int y = 14;
        foreach (string key in EnvKeys)
        {
            Label label = new Label();
            label.Text = key;
            label.Left = 14;
            label.Top = y + 4;
            label.Width = 250;
            label.Height = 22;
            label.ForeColor = Color.White;
            label.BackColor = Color.Transparent;
            panel.Controls.Add(label);

            TextBox box = new TextBox();
            box.Left = 280;
            box.Top = y;
            box.Width = panel.Width - 320;
            box.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top;
            box.Text = env.ContainsKey(key) ? env[key] : "";
            if (key.IndexOf("TOKEN", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                box.UseSystemPasswordChar = true;
            }
            panel.Controls.Add(box);
            boxes[key] = box;
            y += 34;
        }

        Button save = MakeButton("Save", 12, form.ClientSize.Height - 54, 110, 36);
        save.Anchor = AnchorStyles.Left | AnchorStyles.Bottom;
        save.Click += delegate
        {
            Dictionary<string, string> next = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string key in EnvKeys)
            {
                next[key] = boxes[key].Text.Trim();
            }
            WriteEnvFile(next);
            form.Close();
        };
        form.Controls.Add(save);

        Button cancel = MakeButton("Cancel", 134, form.ClientSize.Height - 54, 110, 36);
        cancel.Anchor = AnchorStyles.Left | AnchorStyles.Bottom;
        cancel.Click += delegate { form.Close(); };
        form.Controls.Add(cancel);

        form.ShowDialog(controlPanel);
    }

    private Dictionary<string, string> ReadEnvFile()
    {
        Dictionary<string, string> values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(envPath)) return values;
        foreach (string line in File.ReadAllLines(envPath))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            string trimmed = line.Trim();
            if (trimmed.StartsWith("#", StringComparison.Ordinal)) continue;
            int equals = trimmed.IndexOf('=');
            if (equals <= 0) continue;
            string key = trimmed.Substring(0, equals).Trim();
            string value = trimmed.Substring(equals + 1).Trim();
            values[key] = value;
        }
        return values;
    }

    private void WriteEnvFile(Dictionary<string, string> values)
    {
        StringBuilder output = new StringBuilder();
        foreach (string key in EnvKeys)
        {
            string value = values.ContainsKey(key) ? values[key] : "";
            output.Append(key).Append("=").Append(value).AppendLine();
        }
        File.WriteAllText(envPath, output.ToString(), new UTF8Encoding(false));
    }

    private GitSnapshot GetGitSnapshot(bool fetch)
    {
        GitSnapshot snapshot = new GitSnapshot();
        snapshot.Version = ReadPackageVersion();

        if (fetch)
        {
            CommandResult fetchResult = RunCommand("git", "fetch --prune origin", 20000);
            if (fetchResult.ExitCode != 0 || fetchResult.TimedOut)
            {
                snapshot.FetchFailed = true;
                snapshot.FetchMessage = fetchResult.TimedOut
                    ? "Git fetch timed out. Local repository state was not changed."
                    : "Git fetch failed. Local repository state was not changed.";
            }
        }

        CommandResult head = RunCommand("git", "rev-parse --short HEAD", 8000);
        if (head.ExitCode != 0)
        {
            snapshot.Detail = "Git is unavailable or this folder is not a git repository.";
            return snapshot;
        }

        snapshot.GitAvailable = true;
        snapshot.LocalCommit = FirstLine(head.Output);

        CommandResult upstream = RunCommand("git", "rev-parse --abbrev-ref --symbolic-full-name @{u}", 8000);
        if (upstream.ExitCode == 0 && !string.IsNullOrWhiteSpace(upstream.Output))
        {
            snapshot.UpstreamName = FirstLine(upstream.Output);
        }

        CommandResult upstreamCommit = RunCommand("git", "rev-parse --short " + snapshot.UpstreamName, 8000);
        if (upstreamCommit.ExitCode == 0)
        {
            snapshot.UpstreamCommit = FirstLine(upstreamCommit.Output);
        }

        CommandResult shortStatus = RunCommand("git", "status --short", 8000);
        snapshot.Dirty = shortStatus.ExitCode == 0 && !string.IsNullOrWhiteSpace(shortStatus.Output);

        CommandResult counts = RunCommand("git", "rev-list --left-right --count " + snapshot.UpstreamName + "...HEAD", 8000);
        if (counts.ExitCode == 0)
        {
            string[] parts = FirstLine(counts.Output).Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
            {
                int behind;
                int ahead;
                if (int.TryParse(parts[0], out behind)) snapshot.Behind = behind;
                if (int.TryParse(parts[1], out ahead)) snapshot.Ahead = ahead;
            }
        }

        if (snapshot.Dirty)
        {
            snapshot.Status = "Local changes present";
        }
        else if (snapshot.Ahead > 0 && snapshot.Behind > 0)
        {
            snapshot.Status = "Diverged";
        }
        else if (snapshot.Behind > 0)
        {
            snapshot.Status = "Behind origin";
        }
        else if (snapshot.Ahead > 0)
        {
            snapshot.Status = "Ahead of origin";
        }
        else
        {
            snapshot.Status = "Clean and synced";
        }

        snapshot.Detail = "Upstream: " + snapshot.UpstreamName
            + "  |  ahead " + snapshot.Ahead.ToString(CultureInfo.InvariantCulture)
            + " / behind " + snapshot.Behind.ToString(CultureInfo.InvariantCulture);
        if (snapshot.Dirty)
        {
            snapshot.Detail += "  |  update actions stay read-only";
        }
        return snapshot;
    }

    private string ReadPackageVersion()
    {
        try
        {
            string packagePath = Path.Combine(botDir, "package.json");
            if (!File.Exists(packagePath)) return "unknown";
            Dictionary<string, object> packageJson = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(packagePath));
            if (packageJson != null && packageJson.ContainsKey("version"))
            {
                return Convert.ToString(packageJson["version"], CultureInfo.InvariantCulture);
            }
        }
        catch
        {
        }
        return "unknown";
    }

    private void RunSafeUpdateFromPanel()
    {
        GitSnapshot snapshot = GetGitSnapshot(true);
        if (!snapshot.GitAvailable)
        {
            MessageBox.Show("Git is unavailable, so safe update cannot run.", "Safe Update", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (snapshot.Dirty)
        {
            MessageBox.Show("Local changes are present. Safe update stops here and does not stash or reset your work.", "Safe Update", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        if (snapshot.Ahead > 0 && snapshot.Behind > 0)
        {
            MessageBox.Show("The repository has diverged from origin. Safe update stops here for manual review.", "Safe Update", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (snapshot.Behind <= 0)
        {
            MessageBox.Show("No newer origin commit is available.", "Safe Update", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        DialogResult confirm = MessageBox.Show(
            "Run safe update now?\n\nThis will run git pull --ff-only, install dependencies only if package files changed, run build/check, and restart the bot. It will not stash, reset, or rewrite history.",
            "Safe Update",
            MessageBoxButtons.OKCancel,
            MessageBoxIcon.Question);
        if (confirm != DialogResult.OK) return;

        try
        {
            RunSafeUpdate();
            MessageBox.Show("Safe update completed. The bot was restarted if local config allowed it.", "Safe Update", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Safe update stopped:\n\n" + SafeError(ex.Message), "Safe Update", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void RunSafeUpdate()
    {
        AppendUpdateLog("Safe update started.");
        GitSnapshot before = GetGitSnapshot(true);
        if (before.Dirty) throw new InvalidOperationException("Local changes are present. Commit or revert them before running safe update.");
        if (before.Ahead > 0 && before.Behind > 0) throw new InvalidOperationException("Repository diverged from upstream.");
        if (before.Behind <= 0) throw new InvalidOperationException("No newer origin commit is available.");

        string packageJsonBefore = ReadOptionalFile(Path.Combine(botDir, "package.json"));
        string packageLockBefore = ReadOptionalFile(Path.Combine(botDir, "package-lock.json"));

        RunRequiredCommand("git", "pull --ff-only", 60000, "git pull --ff-only");

        string packageJsonAfter = ReadOptionalFile(Path.Combine(botDir, "package.json"));
        string packageLockAfter = ReadOptionalFile(Path.Combine(botDir, "package-lock.json"));
        bool dependencyFilesChanged = packageJsonBefore != packageJsonAfter || packageLockBefore != packageLockAfter;
        if (dependencyFilesChanged)
        {
            RunRequiredCommand("npm.cmd", "install", 180000, "npm install");
        }

        RunRequiredCommand("npm.cmd", "run build", 180000, "npm run build");
        RunRequiredCommand("npm.cmd", "run check", 240000, "npm run check");

        if (IsRunning())
        {
            AppendUpdateLog("Restarting running bot.");
            RestartBot("windows-safe-update");
        }
        else
        {
            AppendUpdateLog("Bot was not running; no restart needed.");
        }

        AppendUpdateLog("Safe update completed.");
    }

    private void RunRequiredCommand(string fileName, string arguments, int timeoutMs, string label)
    {
        AppendUpdateLog("Running " + label + ".");
        CommandResult result = RunCommand(fileName, arguments, timeoutMs);
        AppendUpdateLog(label + " exit=" + result.ExitCode.ToString(CultureInfo.InvariantCulture) + (result.TimedOut ? " timed out" : ""));
        if (!string.IsNullOrWhiteSpace(result.Output)) AppendUpdateLog(TrimForLog(result.Output));
        if (!string.IsNullOrWhiteSpace(result.Error)) AppendUpdateLog(TrimForLog(result.Error));
        if (result.TimedOut) throw new TimeoutException(label + " timed out.");
        if (result.ExitCode != 0) throw new InvalidOperationException(label + " failed.");
    }

    private string ReadOptionalFile(string filePath)
    {
        try
        {
            return File.Exists(filePath) ? File.ReadAllText(filePath) : "";
        }
        catch
        {
            return "";
        }
    }

    private void AppendUpdateLog(string text)
    {
        try
        {
            string line = DateTime.Now.ToString("s", CultureInfo.InvariantCulture) + " " + text + Environment.NewLine;
            File.AppendAllText(Path.Combine(botDir, "update.log"), line, new UTF8Encoding(false));
        }
        catch
        {
        }
    }

    private static string TrimForLog(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        string trimmed = value.Trim();
        return trimmed.Length <= 4000 ? trimmed : trimmed.Substring(trimmed.Length - 4000);
    }

    private CommandResult RunCommand(string fileName, string arguments, int timeoutMs)
    {
        CommandResult result = new CommandResult();
        try
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = fileName;
            info.Arguments = arguments;
            info.WorkingDirectory = botDir;
            info.UseShellExecute = false;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.CreateNoWindow = true;

            using (Process process = new Process())
            {
                process.StartInfo = info;
                StringBuilder output = new StringBuilder();
                StringBuilder error = new StringBuilder();
                System.Threading.AutoResetEvent outputDone = new System.Threading.AutoResetEvent(false);
                System.Threading.AutoResetEvent errorDone = new System.Threading.AutoResetEvent(false);
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
                {
                    if (args.Data == null) outputDone.Set();
                    else output.AppendLine(args.Data);
                };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
                {
                    if (args.Data == null) errorDone.Set();
                    else error.AppendLine(args.Data);
                };
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                if (!process.WaitForExit(timeoutMs))
                {
                    result.TimedOut = true;
                    result.ExitCode = 124;
                    try { process.Kill(); } catch { }
                    return result;
                }
                outputDone.WaitOne(1000);
                errorDone.WaitOne(1000);

                result.Output = output.ToString();
                result.Error = error.ToString();
                result.ExitCode = process.ExitCode;
            }
        }
        catch (Exception ex)
        {
            result.ExitCode = 1;
            result.Error = SafeError(ex.Message);
        }
        return result;
    }

    private static string FirstLine(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        using (StringReader reader = new StringReader(value.Trim()))
        {
            return reader.ReadLine() ?? "";
        }
    }

    private string StartupShortcutPath()
    {
        string startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
        return Path.Combine(startup, "Attys DC BOT.lnk");
    }

    private bool IsAutostartEnabled()
    {
        return File.Exists(StartupShortcutPath());
    }

    private void SetAutostartEnabled(bool enabled)
    {
        string shortcut = StartupShortcutPath();
        if (!enabled)
        {
            if (File.Exists(shortcut)) File.Delete(shortcut);
            return;
        }

        string target = Path.Combine(botDir, "win-start.bat");
        string script = "$shell = New-Object -ComObject WScript.Shell; "
            + "$shortcut = $shell.CreateShortcut('" + EscapePowerShellSingleQuoted(shortcut) + "'); "
            + "$shortcut.TargetPath = '" + EscapePowerShellSingleQuoted(target) + "'; "
            + "$shortcut.WorkingDirectory = '" + EscapePowerShellSingleQuoted(botDir) + "'; "
            + "$shortcut.IconLocation = '" + EscapePowerShellSingleQuoted(Path.Combine(botDir, "tray", "CodexBotTray.exe")) + "'; "
            + "$shortcut.Save()";
        CommandResult result = RunCommand("powershell", "-NoProfile -ExecutionPolicy Bypass -Command \"" + script.Replace("\"", "\\\"") + "\"", 15000);
        if (result.ExitCode != 0 || result.TimedOut || !File.Exists(shortcut))
        {
            throw new InvalidOperationException("Could not create Startup shortcut.");
        }
    }

    private void OpenStartupFolder()
    {
        string startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
        Process.Start("explorer.exe", Quote(startup));
    }

    private void OpenLog()
    {
        if (!File.Exists(logPath))
        {
            File.WriteAllText(logPath, "", new UTF8Encoding(false));
        }
        Process.Start("notepad.exe", Quote(logPath));
    }

    private void OpenFolder()
    {
        Process.Start("explorer.exe", Quote(botDir));
    }

    private void OpenLocalFile(string filePath)
    {
        if (!File.Exists(filePath))
        {
            MessageBox.Show("File not found: " + Path.GetFileName(filePath), "Open File", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        Process.Start("notepad.exe", Quote(filePath));
    }

    private void OpenUrl(string url)
    {
        try
        {
            Process.Start(url);
        }
        catch
        {
            Process.Start("cmd.exe", "/c start \"\" " + Quote(url));
        }
    }

    private void ExitTray()
    {
        trayIcon.Visible = false;
        Application.Exit();
    }

    private static string SafeError(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "Unknown error";
        return value.Replace(Environment.UserName, "<user>");
    }

    private static string EscapePowerShellSingleQuoted(string value)
    {
        return value.Replace("'", "''");
    }

    private void LoadUsageCache()
    {
        usageData = null;
        usageFetchedAt = 0;
        try
        {
            if (!File.Exists(usageCachePath)) return;
            Dictionary<string, object> cache = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(usageCachePath));
            if (cache == null || !cache.ContainsKey("usage")) return;
            usageData = cache["usage"] as Dictionary<string, object>;
            if (cache.ContainsKey("fetchedAt"))
            {
                usageFetchedAt = Convert.ToInt64(cache["fetchedAt"], CultureInfo.InvariantCulture);
            }
        }
        catch
        {
            usageData = null;
            usageFetchedAt = 0;
        }
    }

    private void SaveUsageCache(Dictionary<string, object> usage)
    {
        string dir = Path.GetDirectoryName(usageCachePath);
        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
        usageFetchedAt = UnixMilliseconds(DateTime.UtcNow);
        Dictionary<string, object> cache = new Dictionary<string, object>();
        cache["fetchedAt"] = usageFetchedAt;
        cache["usage"] = usage;
        File.WriteAllText(usageCachePath, json.Serialize(cache), new UTF8Encoding(false));
    }

    private void RefreshUsage(bool force)
    {
        if (!force && lastUsageRefresh != DateTime.MinValue && (DateTime.Now - lastUsageRefresh).TotalSeconds < 60) return;
        lastUsageRefresh = DateTime.Now;
        try
        {
            Dictionary<string, object> fetched = RequestCodexUsage();
            if (fetched != null)
            {
                usageData = fetched;
                SaveUsageCache(fetched);
            }
            else
            {
                LoadUsageCache();
            }
        }
        catch
        {
            LoadUsageCache();
        }
        RenderUsagePanel();
    }

    private Dictionary<string, object> RequestCodexUsage()
    {
        string command = ResolveCodexCommand();
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = command;
        info.Arguments = "app-server";
        info.WorkingDirectory = botDir;
        info.UseShellExecute = false;
        info.RedirectStandardInput = true;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;
        info.CreateNoWindow = true;

        using (Process process = Process.Start(info))
        {
            if (process == null) return null;
            string responseLine = null;
            System.Threading.AutoResetEvent received = new System.Threading.AutoResetEvent(false);
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (args.Data == null) return;
                try
                {
                    Dictionary<string, object> payload = json.Deserialize<Dictionary<string, object>>(args.Data);
                    if (payload != null && payload.ContainsKey("id") && Convert.ToString(payload["id"], CultureInfo.InvariantCulture) == "2")
                    {
                        responseLine = args.Data;
                        received.Set();
                    }
                }
                catch
                {
                }
            };
            process.BeginOutputReadLine();
            SendJsonLine(process, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"clientInfo\":{\"name\":\"attys-dc-bot-windows-tray\",\"version\":\"0.1.0\"},\"capabilities\":{\"experimentalApi\":true}}}");
            SendJsonLine(process, "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"account/rateLimits/read\",\"params\":{}}");

            if (received.WaitOne(15000) && !string.IsNullOrWhiteSpace(responseLine))
            {
                Dictionary<string, object> payload = json.Deserialize<Dictionary<string, object>>(responseLine);
                try { process.Kill(); } catch { }
                if (!payload.ContainsKey("result")) return null;
                return NormalizeUsage(payload["result"] as Dictionary<string, object>);
            }
            try { process.Kill(); } catch { }
        }
        return null;
    }

    private void SendJsonLine(Process process, string line)
    {
        process.StandardInput.WriteLine(line);
        process.StandardInput.Flush();
    }

    private string ResolveCodexCommand()
    {
        try
        {
            if (File.Exists(runtimeCachePath))
            {
                Dictionary<string, object> cache = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(runtimeCachePath));
                if (cache != null && cache.ContainsKey("codexCommand"))
                {
                    string command = Convert.ToString(cache["codexCommand"], CultureInfo.InvariantCulture);
                    if (!string.IsNullOrWhiteSpace(command)) return command;
                }
            }
        }
        catch
        {
        }
        return "codex.cmd";
    }

    private Dictionary<string, object> NormalizeUsage(Dictionary<string, object> result)
    {
        if (result == null) return null;
        if (result.ContainsKey("buckets")) return result;

        Dictionary<string, object> snapshot = null;
        if (result.ContainsKey("rateLimitsByLimitId"))
        {
            Dictionary<string, object> byId = result["rateLimitsByLimitId"] as Dictionary<string, object>;
            if (byId != null && byId.ContainsKey("codex")) snapshot = byId["codex"] as Dictionary<string, object>;
        }
        if (snapshot == null && result.ContainsKey("rateLimits"))
        {
            snapshot = result["rateLimits"] as Dictionary<string, object>;
        }
        if (snapshot == null) return null;

        ArrayList buckets = new ArrayList();
        Dictionary<string, object> bucket = new Dictionary<string, object>();
        bucket["title"] = null;
        if (snapshot.ContainsKey("primary")) bucket["primary"] = snapshot["primary"];
        if (snapshot.ContainsKey("secondary")) bucket["secondary"] = snapshot["secondary"];
        buckets.Add(bucket);

        Dictionary<string, object> usage = new Dictionary<string, object>();
        if (snapshot.ContainsKey("planType")) usage["planType"] = snapshot["planType"];
        usage["buckets"] = buckets;
        return usage;
    }

    private void RenderUsagePanel()
    {
        if (usagePanel == null || usagePanel.IsDisposed) return;
        usagePanel.Controls.Clear();
        LoadUsageCache();

        if (usageData == null)
        {
            if (usageStatusLabel != null) usageStatusLabel.Text = "Codex usage: cache missing or unavailable";
            Label empty = MakeLabel("Usage unavailable. Use Refresh Usage after `codex login status` is healthy.", 16, 18, usagePanel.Width - 32, 44, 10, FontStyle.Regular);
            empty.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
            usagePanel.Controls.Add(empty);
            return;
        }

        if (usageStatusLabel != null)
        {
            usageStatusLabel.Text = usageFetchedAt > 0
                ? "Codex usage cache: " + FormatAge(usageFetchedAt)
                : "Codex usage cache: loaded";
        }

        int y = 16;
        string planType = ReadString(usageData, "planType");
        if (!string.IsNullOrWhiteSpace(planType))
        {
            Label plan = MakeLabel("Plan: " + planType, 16, y, usagePanel.Width - 32, 24, 10, FontStyle.Bold);
            plan.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
            usagePanel.Controls.Add(plan);
            y += 34;
        }

        ArrayList rows = ReadUsageRows(usageData);
        if (rows.Count == 0)
        {
            Label none = MakeLabel("Usage cache exists, but no displayable limit windows were found.", 16, y, usagePanel.Width - 32, 40, 10, FontStyle.Regular);
            usagePanel.Controls.Add(none);
            return;
        }

        foreach (Dictionary<string, object> row in rows)
        {
            string title = ReadString(row, "title");
            if (!string.IsNullOrWhiteSpace(title))
            {
                Label bucket = MakeLabel(title, 16, y, usagePanel.Width - 32, 22, 10, FontStyle.Bold);
                bucket.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
                usagePanel.Controls.Add(bucket);
                y += 26;
            }

            Dictionary<string, object> window = row["window"] as Dictionary<string, object>;
            int percentLeft = UsagePercentLeft(window);
            Label label = MakeLabel(UsageLabel(window) + " - " + percentLeft.ToString(CultureInfo.InvariantCulture) + "% left", 16, y, usagePanel.Width - 32, 22, 10, FontStyle.Regular);
            label.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
            usagePanel.Controls.Add(label);
            y += 26;

            Panel barBack = new Panel();
            barBack.Left = 16;
            barBack.Top = y;
            barBack.Width = usagePanel.Width - 32;
            barBack.Height = 14;
            barBack.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
            barBack.BackColor = Color.FromArgb(54, 61, 74);
            usagePanel.Controls.Add(barBack);

            Panel bar = new Panel();
            bar.Left = 0;
            bar.Top = 0;
            bar.Height = 14;
            bar.Width = Math.Max(2, (barBack.Width * percentLeft) / 100);
            bar.BackColor = percentLeft < 15 ? Color.FromArgb(239, 68, 68) : percentLeft < 35 ? Color.FromArgb(245, 158, 11) : Color.FromArgb(16, 185, 129);
            barBack.Controls.Add(bar);
            y += 28;

            string reset = UsageResetText(window);
            if (!string.IsNullOrWhiteSpace(reset))
            {
                Label resetLabel = MakeLabel(reset, 16, y, usagePanel.Width - 32, 20, 9, FontStyle.Regular);
                resetLabel.ForeColor = Color.FromArgb(180, 190, 205);
                resetLabel.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
                usagePanel.Controls.Add(resetLabel);
                y += 24;
            }
            y += 8;
        }
    }

    private ArrayList ReadUsageRows(Dictionary<string, object> usage)
    {
        ArrayList rows = new ArrayList();
        ArrayList buckets = usage.ContainsKey("buckets") ? usage["buckets"] as ArrayList : null;
        if (buckets == null) return rows;
        foreach (object item in buckets)
        {
            Dictionary<string, object> bucket = item as Dictionary<string, object>;
            if (bucket == null) continue;
            string title = ReadString(bucket, "title");
            if (bucket.ContainsKey("primary"))
            {
                Dictionary<string, object> row = new Dictionary<string, object>();
                row["title"] = title;
                row["window"] = bucket["primary"];
                rows.Add(row);
            }
            if (bucket.ContainsKey("secondary"))
            {
                Dictionary<string, object> row = new Dictionary<string, object>();
                row["title"] = "";
                row["window"] = bucket["secondary"];
                rows.Add(row);
            }
        }
        return rows;
    }

    private int UsagePercentLeft(Dictionary<string, object> window)
    {
        double used = ReadDouble(window, "usedPercent", 100);
        int left = 100 - (int)Math.Round(used);
        if (left < 0) return 0;
        if (left > 100) return 100;
        return left;
    }

    private string UsageLabel(Dictionary<string, object> window)
    {
        double minutes = ReadDouble(window, "windowDurationMins", 0);
        if (Math.Abs(minutes - 300) < 0.1) return "5-hour limit";
        if (Math.Abs(minutes - 10080) < 0.1) return "7-day limit";
        if (minutes > 0) return ((int)minutes).ToString(CultureInfo.InvariantCulture) + "-minute limit";
        return "Usage limit";
    }

    private string UsageResetText(Dictionary<string, object> window)
    {
        double resetsAt = ReadDouble(window, "resetsAt", 0);
        if (resetsAt <= 0) return "";
        DateTime reset = UnixEpoch().AddSeconds((long)resetsAt).ToLocalTime();
        return "Resets " + reset.ToString("g", CultureInfo.CurrentCulture);
    }

    private string FormatAge(long fetchedAt)
    {
        DateTime fetched = UnixEpoch().AddMilliseconds(fetchedAt).ToLocalTime();
        TimeSpan age = DateTime.Now - fetched;
        if (age.TotalMinutes < 1) return "updated just now";
        if (age.TotalHours < 1) return "updated " + ((int)age.TotalMinutes).ToString(CultureInfo.InvariantCulture) + "m ago";
        return "updated " + ((int)age.TotalHours).ToString(CultureInfo.InvariantCulture) + "h ago";
    }

    private static DateTime UnixEpoch()
    {
        return new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    }

    private static long UnixMilliseconds(DateTime utc)
    {
        return (long)(utc.ToUniversalTime() - UnixEpoch()).TotalMilliseconds;
    }

    private string ReadString(Dictionary<string, object> obj, string key)
    {
        if (obj == null || !obj.ContainsKey(key) || obj[key] == null) return "";
        return Convert.ToString(obj[key], CultureInfo.InvariantCulture);
    }

    private double ReadDouble(Dictionary<string, object> obj, string key, double fallback)
    {
        if (obj == null || !obj.ContainsKey(key) || obj[key] == null) return fallback;
        try { return Convert.ToDouble(obj[key], CultureInfo.InvariantCulture); }
        catch { return fallback; }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }
}
