using System;
using System.Linq;
using Dalamud.Game.Command;
using Dalamud.Interface.Windowing;
using Dalamud.IoC;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;
using FFXIVClientStructs.FFXIV.Client.Game;

namespace SubmarineExport;

public sealed unsafe class Plugin : IDalamudPlugin
{
    [PluginService] internal static IDalamudPluginInterface PluginInterface { get; private set; } = null!;
    [PluginService] internal static ICommandManager CommandManager { get; private set; } = null!;
    [PluginService] internal static IChatGui Chat { get; private set; } = null!;
    [PluginService] internal static IFramework Framework { get; private set; } = null!;
    [PluginService] internal static IClientState ClientState { get; private set; } = null!;
    [PluginService] internal static IObjectTable ObjectTable { get; private set; } = null!;

    private const string Command = "/subs";
    public Configuration Config { get; }
    private readonly WindowSystem windows = new("SubmarineExport");
    private readonly MainWindow window;
    private DateTime lastCheck = DateTime.MinValue;

    public Plugin()
    {
        Config = PluginInterface.GetPluginConfig() as Configuration ?? new Configuration();
        window = new MainWindow(Config);
        windows.AddWindow(window);
        CommandManager.AddHandler(Command, new CommandInfo((_, _) => window.Toggle()) { HelpMessage = "Open Submarine Export" });
        PluginInterface.UiBuilder.Draw += windows.Draw;
        PluginInterface.UiBuilder.OpenMainUi += window.Toggle;
        PluginInterface.UiBuilder.OpenConfigUi += window.Toggle;
        Framework.Update += OnUpdate;
    }

    private void OnUpdate(IFramework _)
    {
        if ((DateTime.UtcNow - lastCheck).TotalSeconds < 3) return;
        lastCheck = DateTime.UtcNow;
        try { Scan(); NotifyReady(); } catch { /* never let a bad read break the game */ }
    }

    // Where the player is standing, used as the key for the workshop.
    private (string key, string tag) Where()
    {
        var t = (int)ClientState.TerritoryType;
        var hm = HousingManager.Instance();
        var ward = hm != null ? (int)hm->GetCurrentWard() + 1 : 0;
        var plot = hm != null ? (int)hm->GetCurrentPlot() + 1 : 0;
        var tag = "";
        try { tag = ObjectTable.LocalPlayer?.CompanyTag.TextValue ?? ""; } catch { }
        return ($"{t}:{ward}:{plot}", tag);
    }

    private void Scan()
    {
        var subs = Reader.Read();
        if (subs == null || subs.Count == 0) return;
        var (key, tag) = Where();
        var fc = Config.Fcs.FirstOrDefault(f => f.Key == key);
        var changed = false;
        if (fc == null)
        {
            fc = new FcRecord { Key = key, Tag = tag, Name = tag.Length > 0 ? $"[{tag}] workshop" : $"Workshop {Config.Fcs.Count + 1}" };
            Config.Fcs.Add(fc); changed = true;
        }
        if (fc.Tag == "" && tag != "") { fc.Tag = tag; changed = true; }
        var now = DateTime.UtcNow;
        foreach (var s in subs)
        {
            s.LastSeen = now;
            var old = fc.Subs.FirstOrDefault(x => x.Slot == s.Slot);
            if (old == null) { fc.Subs.Add(s); changed = true; continue; }
            var different = !old.SameBuild(s) || old.ReturnUnix != s.ReturnUnix || !old.Route.SequenceEqual(s.Route);
            if (old.ReturnUnix != s.ReturnUnix) old.ReadyNotified = false;   // sent out again
            if (different) { old.Name = s.Name; old.Rank = s.Rank; old.Hull = s.Hull; old.Stern = s.Stern; old.Bow = s.Bow; old.Bridge = s.Bridge; old.ReturnUnix = s.ReturnUnix; old.Route = s.Route; changed = true; }
            old.LastSeen = now;
        }
        // Slots that are no longer registered are dropped.
        var slots = subs.Select(x => x.Slot).ToHashSet();
        if (fc.Subs.RemoveAll(x => !slots.Contains(x.Slot)) > 0) changed = true;
        if (changed) Config.Save();
    }

    private void NotifyReady()
    {
        if (!Config.ChatWhenReady) return;
        var nowUnix = (uint)DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var dirty = false;
        foreach (var fc in Config.Fcs)
            foreach (var s in fc.Subs)
                if (s.ReturnUnix != 0 && s.ReturnUnix <= nowUnix && !s.ReadyNotified)
                {
                    s.ReadyNotified = true; dirty = true;
                    Chat.Print($"[Submarine Export] {fc.Name}: {s.Name} is back.");
                }
        if (dirty) Config.Save();
    }

    public void Dispose()
    {
        Framework.Update -= OnUpdate;
        PluginInterface.UiBuilder.Draw -= windows.Draw;
        PluginInterface.UiBuilder.OpenMainUi -= window.Toggle;
        PluginInterface.UiBuilder.OpenConfigUi -= window.Toggle;
        windows.RemoveAllWindows();
        CommandManager.RemoveHandler(Command);
    }
}
