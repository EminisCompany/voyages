# Submarine Export

Dalamud plugin that reads the submarines in your free company workshop and copies them in the format the Submarine Voyage Planner reads.

- Open with `/subs`.
- Stand inside your FC workshop (or open its Voyage Control Panel) so the game loads the submarine data. The plugin saves what it sees, per workshop.
- **Copy all for the planner** puts one line per sub on your clipboard: `FC name, rank, build`. Paste it into the planner's "Paste many subs at once" box.
- Build codes list hull, stern, bow, bridge as letters (S Shark, U Unkiu, W Whale, C Coelacanth, Y Syldra). A trailing `+` means all four parts are modified. When only some parts are modified, an `M` follows each modified letter, for example `WMSUCM`.

It only reads game data. It does not send subs, pick routes or press anything for you, and it adds no server-info-bar entry and no game hooks.

## Status

Not built or tested in game yet. The submarine slot layout comes from FFXIVClientStructs (`HousingWorkshopSubmersibleSubData`). If a build fails or a sub shows the wrong rank or parts, that struct layout is the first place to look.
