using System.Collections.Generic;
using System.Linq;

namespace SubmarineExport;

/// Submarine part ids (SubmarinePart row numbers) mapped to their class letter, modified flag and slot (0 hull, 1 stern, 2 bow, 3 bridge).
/// Letters: S Shark, U Unkiu, W Whale, C Coelacanth, Y Syldra. Generated from the game's SubmarinePart sheet.
public static class Parts
{
    private static readonly Dictionary<int, (char Letter, bool Modified, int Slot)> Table = new()
    {
        [1] = ('S', false, 2),
        [2] = ('S', false, 3),
        [3] = ('S', false, 0),
        [4] = ('S', false, 1),
        [5] = ('U', false, 2),
        [6] = ('U', false, 3),
        [7] = ('U', false, 0),
        [8] = ('U', false, 1),
        [9] = ('W', false, 2),
        [10] = ('W', false, 3),
        [11] = ('W', false, 0),
        [12] = ('W', false, 1),
        [13] = ('C', false, 2),
        [14] = ('C', false, 3),
        [15] = ('C', false, 0),
        [16] = ('C', false, 1),
        [17] = ('Y', false, 2),
        [18] = ('Y', false, 3),
        [19] = ('Y', false, 0),
        [20] = ('Y', false, 1),
        [21] = ('S', true, 2),
        [22] = ('S', true, 3),
        [23] = ('S', true, 0),
        [24] = ('S', true, 1),
        [25] = ('U', true, 2),
        [26] = ('U', true, 3),
        [27] = ('U', true, 0),
        [28] = ('U', true, 1),
        [29] = ('W', true, 2),
        [30] = ('W', true, 3),
        [31] = ('W', true, 0),
        [32] = ('W', true, 1),
        [33] = ('C', true, 2),
        [34] = ('C', true, 3),
        [35] = ('C', true, 0),
        [36] = ('C', true, 1),
        [37] = ('Y', true, 2),
        [38] = ('Y', true, 3),
        [39] = ('Y', true, 0),
        [40] = ('Y', true, 1)
    };

    public static (char Letter, bool Modified) Lookup(int id) => Table.TryGetValue(id, out var p) ? (p.Letter, p.Modified) : ('?', false);

    /// Build code in hull, stern, bow, bridge order: "WSUC", "WSUC+" (all four modified) or, when only some parts are modified,
    /// an M after each modified letter, for example "WMSUCM".
    public static string BuildCode(int hull, int stern, int bow, int bridge)
    {
        var ps = new[] { Lookup(hull), Lookup(stern), Lookup(bow), Lookup(bridge) };
        var allMod = ps.All(p => p.Modified);
        var sb = new System.Text.StringBuilder();
        foreach (var p in ps) sb.Append(p.Letter).Append(!allMod && p.Modified ? "M" : "");
        if (allMod) sb.Append('+');
        return sb.ToString();
    }
}
