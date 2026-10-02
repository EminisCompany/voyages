using System;
using System.Collections.Generic;
using FFXIVClientStructs.FFXIV.Client.Game;

namespace SubmarineExport;

/// Reads the submarine slots of the free company workshop the player is standing in.
/// Only fills in while the workshop is loaded (inside the workshop, or with the Voyage Control Panel open there).
public static unsafe class Reader
{
    public static List<SubRecord>? Read()
    {
        var hm = HousingManager.Instance();
        if (hm == null) return null;
        var wt = hm->WorkshopTerritory;
        if (wt == null) return null;

        var list = new List<SubRecord>();
        var size = sizeof(HousingWorkshopSubmersibleSubData);
        var baseAddr = (byte*)&wt->Submersible;
        for (var i = 0; i < 4; i++)
        {
            var s = (HousingWorkshopSubmersibleSubData*)(baseAddr + i * size);
            if (s->RankId == 0) continue;                       // empty slot
            var name = ReadName((byte*)s + 0x22, 20);
            if (name.Length == 0) continue;
            var rec = new SubRecord
            {
                Slot = i, Name = name, Rank = s->RankId,
                Hull = s->HullId, Stern = s->SternId, Bow = s->BowId, Bridge = s->BridgeId,
                ReturnUnix = s->ReturnTime,
            };
            var points = (byte*)s + 0x42;                       // five exploration point ids, 0 when unused
            for (var p = 0; p < 5; p++) if (points[p] != 0) rec.Route.Add(points[p]);
            list.Add(rec);
        }
        return list;
    }

    private static string ReadName(byte* p, int max)
    {
        var len = 0;
        while (len < max && p[len] != 0) len++;
        return len == 0 ? "" : System.Text.Encoding.UTF8.GetString(p, len);
    }
}
