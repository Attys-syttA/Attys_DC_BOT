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
        "DISCORD_EPHEMERAL_RESPONSES",
        "SHOW_COST",
        "DISCORD_REGISTER_COMMANDS",
        "DISCORD_ENABLE_RUN_TESTS",
        "DISCORD_ENABLE_AUTO_APPROVE",
        "DISCORD_ENABLE_SESSION_DELETE"
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
    private Panel usagePanel;
    private Label usageStatusLabel;
    private DateTime lastUsageRefresh = DateTime.MinValue;
    private Dictionary<string, object> usageData;
    private long usageFetchedAt;

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
        controlPanel.Size = new Size(520, 640);
        controlPanel.MinimumSize = new Size(480, 560);
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
            if (IsRunning()) StopBot(); else StartBot(true);
            RebuildControlPanel();
        };
        controlPanel.Controls.Add(startStop);

        Button restart = MakeButton("Restart", 185, y, 140, 42);
        restart.Click += delegate { RestartBot(); RebuildControlPanel(); };
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

        y += 66;
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

        string runner = File.Exists(botExePath) ? botExePath : "node";
        string entry = Path.Combine(botDir, "dist", "index.js");
        string command = "cd /d " + Quote(botDir) + " && " + Quote(runner) + " " + Quote(entry) + " >> " + Quote(logPath) + " 2>> " + Quote(errorLogPath);
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

    private void RestartBot()
    {
        StopBot();
        StartBot(true);
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
