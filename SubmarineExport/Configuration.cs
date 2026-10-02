using System;
using System.Collections.Generic;
using Dalamud.Configuration;

namespace SubmarineExport;

public class Configuration : IPluginConfiguration
{
    public int Version { get; set; } = 1;
    public bool ChatWhenReady = true;
    public List<FcRecord> Fcs = new();

    public void Save() => Plugin.PluginInterface.SavePluginConfig(this);
}

public class FcRecord
{
    public string Key = "";      // territory:ward:plot of the workshop, so two FCs never merge
    public string Name = "";
    public string Tag = "";
    public List<SubRecord> Subs = new();
}

public class SubRecord
{
    public int Slot;
    public string Name = "";
    public int Rank;
    public int Hull, Stern, Bow, Bridge;       // SubmarinePart row numbers
    public uint ReturnUnix;                    // 0 when idle
    public List<int> Route = new();            // SubmarineExploration row numbers of the current voyage
    public DateTime LastSeen;
    public bool ReadyNotified;

    public bool SameBuild(SubRecord o) => Rank == o.Rank && Hull == o.Hull && Stern == o.Stern && Bow == o.Bow && Bridge == o.Bridge && Name == o.Name;
}
