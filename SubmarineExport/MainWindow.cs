using System;
using System.Linq;
using System.Numerics;
using System.Text;
using Dalamud.Bindings.ImGui;
using Dalamud.Interface.Windowing;

namespace SubmarineExport;

public class MainWindow : Window
{
    private static readonly Vector4 Green = new(0.3f, 0.8f, 0.3f, 1), Amber = new(0.9f, 0.7f, 0.2f, 1), Grey = new(0.6f, 0.6f, 0.6f, 1);
    private readonly Configuration cfg;
    private string status = "";

    public MainWindow(Configuration cfg) : base("Submarine Export###SubmarineExport")
    {
        this.cfg = cfg;
        Size = new Vector2(760, 420);
        SizeCondition = ImGuiCond.FirstUseEver;
    }

    public override void Draw()
    {
        if (cfg.Fcs.Count == 0)
        {
            ImGui.TextWrapped("No submarines saved yet. Stand inside your free company workshop (or open its Voyage Control Panel) and they will appear here.");
            return;
        }
        if (ImGui.Button("Copy all for the planner")) Copy(cfg.Fcs.ToList());
        ImGui.SameLine();
        var chat = cfg.ChatWhenReady;
        if (ImGui.Checkbox("Say in chat when a sub is back", ref chat)) { cfg.ChatWhenReady = chat; cfg.Save(); }
        if (status != "") { ImGui.SameLine(); ImGui.TextColored(Green, status); }
        ImGui.Separator();

        FcRecord? remove = null;
        foreach (var fc in cfg.Fcs)
        {
            ImGui.PushID(fc.Key);
            var name = fc.Name;
            ImGui.SetNextItemWidth(260);
            if (ImGui.InputText("##name", ref name, 64)) { fc.Name = name; cfg.Save(); }
            ImGui.SameLine(); if (ImGui.SmallButton("Copy this FC")) Copy(new() { fc });
            ImGui.SameLine(); if (ImGui.SmallButton("Forget")) remove = fc;
            DrawSubs(fc);
            ImGui.Spacing();
            ImGui.PopID();
        }
        if (remove != null) { cfg.Fcs.Remove(remove); cfg.Save(); }
    }

    private void DrawSubs(FcRecord fc)
    {
        if (!ImGui.BeginTable("subs", 5, ImGuiTableFlags.RowBg | ImGuiTableFlags.SizingStretchProp)) return;
        ImGui.TableSetupColumn("Sub", ImGuiTableColumnFlags.WidthFixed, 130);
        ImGui.TableSetupColumn("Rank", ImGuiTableColumnFlags.WidthFixed, 50);
        ImGui.TableSetupColumn("Build", ImGuiTableColumnFlags.WidthFixed, 90);
        ImGui.TableSetupColumn("Voyage");
        ImGui.TableSetupColumn("Route");
        ImGui.TableHeadersRow();
        var nowUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        foreach (var s in fc.Subs.OrderBy(x => x.Slot))
        {
            ImGui.TableNextRow();
            ImGui.TableNextColumn(); ImGui.Text(s.Name);
            ImGui.TableNextColumn(); ImGui.Text(s.Rank.ToString());
            ImGui.TableNextColumn(); ImGui.Text(Parts.BuildCode(s.Hull, s.Stern, s.Bow, s.Bridge));
            ImGui.TableNextColumn();
            if (s.ReturnUnix == 0) ImGui.TextColored(Grey, "Idle");
            else if (s.ReturnUnix <= nowUnix) ImGui.TextColored(Green, "Back, ready to collect");
            else ImGui.TextColored(Amber, "Back in " + Fmt(TimeSpan.FromSeconds(s.ReturnUnix - nowUnix)));
            ImGui.TableNextColumn();
            var route = string.Join(" ", s.Route.Select(Sectors.Letter));
            ImGui.Text(route);
            if (route != "" && ImGui.IsItemHovered()) ImGui.SetTooltip(string.Join("\n", s.Route.Select(Sectors.Describe)));
        }
        ImGui.EndTable();
    }

    private static string Fmt(TimeSpan t) => $"{(int)t.TotalHours}h {t.Minutes:00}m";

    // One line per sub in the format the planner's "paste many subs" box reads: FC name, rank, build.
    private void Copy(System.Collections.Generic.List<FcRecord> fcs)
    {
        var sb = new StringBuilder();
        foreach (var fc in fcs)
            foreach (var s in fc.Subs.OrderBy(x => x.Slot))
                sb.AppendLine($"{fc.Name.Replace(",", " ")}, {s.Rank}, {Parts.BuildCode(s.Hull, s.Stern, s.Bow, s.Bridge)}");
        ImGui.SetClipboardText(sb.ToString());
        status = "Copied. Paste it into the planner.";
    }
}
