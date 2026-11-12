// Data layer. Every fact shown in the app comes from one of three live sources:
//   XIVAPI v2 (game data), Universalis (market), Teamcraft open data (patch numbers, shipped as data/patch-index.json).
// Nothing is invented: if a lookup fails or is empty the callers show "no verified answer".

const XIV = 'https://v2.xivapi.com/api';
const UNI = 'https://universalis.app/api/v2';
const TTL = { game: 7 * 864e5, market: 3e5, meta: 864e5 };

const mem = new Map();
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('cmp:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('cmp:' + k, JSON.stringify(v)); } catch { /* quota / unavailable: ignore */ } },
};

/** GET json with memory + localStorage cache. Falls back to a stale copy when offline. */
export async function getJSON(url, ttl = TTL.game) {
  const now = Date.now();
  const hit = mem.get(url) || store.get(url);
  if (hit && now - hit.t < ttl) { mem.set(url, hit); return { data: hit.d, fetchedAt: hit.t, cached: true }; }
  try {
    const r = await fetch(url);
    if (r.status === 404) { const e = new Error('not found'); e.status = 404; throw e; }
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    const d = await r.json();
    const rec = { t: now, d };
    mem.set(url, rec); store.set(url, rec);
    return { data: d, fetchedAt: now, cached: false };
  } catch (e) {
    if (e.status === 404) throw e;
    if (hit) return { data: hit.d, fetchedAt: hit.t, cached: true, stale: true };
    throw e;
  }
}

const qs = o => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const clean = s => s.replace(/["\\]/g, ' ').trim();

// ---------- patch index (Teamcraft open data) ----------
let patchIdx;
export async function patchIndex() {
  if (!patchIdx) {
    patchIdx = fetch('./data/patch-index.json').then(r => r.json()).catch(() => null);
  }
  return patchIdx;
}
export async function patchFor(kind, id) {
  const idx = await patchIndex();
  if (!idx) return null;
  const pid = idx[kind]?.[id];
  return pid == null ? null : idx.patches[pid] ?? null;
}

// ---------- game data version (XIVAPI) ----------
export async function gameVersion(hash) {
  try {
    const { data } = await getJSON(XIV + '/version', TTL.meta);
    const v = data.versions.find(x => x.key === hash);
    return v ? v.names.find(n => n !== 'latest') || v.names[0] : null;
  } catch { return null; }
}

// ---------- search ----------
const SEARCH = {
  Quest: 'Name,Expansion.Name,PlaceName.Name',
  Item: 'Name,ItemUICategory.Name,LevelItem@as(raw)',
  ContentFinderCondition: 'Name,ContentType.Name,ClassJobLevelRequired',
};
export async function search(q, kinds = ['Quest', 'Item', 'ContentFinderCondition'], limits = { Quest: 10, Item: 14, ContentFinderCondition: 8 }) {
  q = clean(q);
  if (q.length < 2) return [];
  const runs = await Promise.allSettled(kinds.map(k =>
    getJSON(`${XIV}/search?` + qs({ sheets: k, query: `Name~"${q}"`, fields: SEARCH[k], limit: limits[k] || 10 }), TTL.game)));
  const out = []; let failed = 0, version = null;
  runs.forEach((r, i) => {
    if (r.status !== 'fulfilled') { failed++; return; }
    version = r.value.data.version;
    for (const x of r.value.data.results) if (x.fields.Name) out.push({ kind: kinds[i], id: x.row_id, score: x.score, f: x.fields });
  });
  if (failed === kinds.length) throw new Error('XIVAPI unreachable');
  return { results: out, version };
}

// ---------- coordinates ----------
/** Standard FFXIV world -> map coordinate conversion (SizeFactor/100 = scale). */
export function mapCoord(v, sizeFactor, offset) {
  const c = sizeFactor / 100;
  return Math.round((41 / c * (((v + offset) * c + 1024) / 2048) + 1) * 10) / 10;
}

// ---------- quest ----------
const QUEST_FIELDS = [
  'Name', 'Id', 'Expansion.Name', 'ClassJobLevel', 'ClassJobCategory0.Name', 'JournalGenre.Name', 'PlaceName.Name',
  'IssuerStart.Singular', 'IssuerLocation.X', 'IssuerLocation.Z', 'IssuerLocation.Map.SizeFactor', 'IssuerLocation.Map.OffsetX',
  'IssuerLocation.Map.OffsetY', 'IssuerLocation.Map.PlaceName.Name', 'PreviousQuest[].Name', 'GilReward', 'ItemCountReward',
  'OptionalItemReward[].Name', 'Reward[].Name',
].join(',');

export async function getQuest(id) {
  const { data, fetchedAt, cached } = await getJSON(`${XIV}/sheet/Quest/${id}?fields=${QUEST_FIELDS}`);
  const f = data.fields;
  const q = { id, version: data.version, fetchedAt, cached, name: f.Name, expansion: f.Expansion?.fields?.Name, genre: f.JournalGenre?.fields?.Name,
    category: f.ClassJobCategory0?.fields?.Name, level: (f.ClassJobLevel || [])[0] || 0, zone: f.PlaceName?.fields?.Name, gil: f.GilReward || 0 };
  q.npc = f.IssuerStart?.fields?.Singular || null;
  const L = f.IssuerLocation?.fields;
  if (L && L.Map?.fields) {
    const m = L.Map.fields;
    q.where = { area: m.PlaceName?.fields?.Name, x: mapCoord(L.X, m.SizeFactor, m.OffsetX), y: mapCoord(L.Z, m.SizeFactor, m.OffsetY) };
  }
  q.prev = (f.PreviousQuest || []).filter(p => p.value).map(p => ({ id: p.value, name: p.fields?.Name }));
  q.rewards = (f.Reward || []).concat(f.OptionalItemReward || []).filter(p => p.value).map(p => ({ id: p.value, name: p.fields?.Name }));
  // Objective + journal text lives in a per-quest sheet: quest/<suffix/100, 3 digits>/<Id>
  const m = /_(\d+)$/.exec(f.Id || '');
  q.steps = []; q.story = [];
  if (m) {
    const folder = String(Math.floor(+m[1] / 100)).padStart(3, '0');
    try {
      const t = await getJSON(`${XIV}/sheet/${encodeURIComponent(`quest/${folder}/${f.Id}`)}?limit=80&fields=*`);
      for (const r of t.data.rows) {
        const key = r.fields.unknown0 || '', txt = (r.fields.unknown4 || '').replace(/\s+/g, ' ').trim();
        if (!txt) continue;
        if (/_TODO_\d+$/.test(key)) q.steps.push(txt);
        else if (/_SEQ_\d+$/.test(key)) q.story.push(txt);
      }
    } catch { q.textMissing = true; }
  }
  q.patch = await patchFor('quest', id);
  q.gameVersion = await gameVersion(data.version);
  return q;
}

/** Quests that list this quest as a prerequisite (i.e. what it unlocks). */
export async function nextQuests(id) {
  const { data } = await getJSON(`${XIV}/search?` + qs({ sheets: 'Quest', query: `PreviousQuest[]=${id}`, fields: 'Name,ClassJobLevel', limit: 12 }));
  return data.results.filter(r => r.fields.Name).map(r => ({ id: r.row_id, name: r.fields.Name, level: (r.fields.ClassJobLevel || [])[0] || 0 }));
}

// ---------- item + recipes ----------
export async function getItem(id) {
  const fields = 'Name,Description,LevelItem@as(raw),ItemUICategory.Name,IsUntradable,CanBeHq,StackSize,PriceMid,Rarity';
  const { data, fetchedAt, cached } = await getJSON(`${XIV}/sheet/Item/${id}?fields=${fields}`);
  const f = data.fields;
  const it = { id, version: data.version, fetchedAt, cached, name: f.Name, desc: f.Description, ilvl: f['LevelItem@as(raw)'], category: f.ItemUICategory?.fields?.Name,
    untradable: !!f.IsUntradable, hq: !!f.CanBeHq, stack: f.StackSize, vendorPrice: f.PriceMid };
  const rf = 'CraftType.Name,RecipeLevelTable.ClassJobLevel,Ingredient[].Name,AmountIngredient,AmountResult';
  try {
    const r = await getJSON(`${XIV}/search?` + qs({ sheets: 'Recipe', query: `ItemResult=${id}`, fields: rf, limit: 5 }));
    it.recipes = r.data.results.map(x => ({
      id: x.row_id, craft: x.fields.CraftType?.fields?.Name, level: x.fields.RecipeLevelTable?.fields?.ClassJobLevel, yields: x.fields.AmountResult || 1,
      ingredients: (x.fields.Ingredient || []).map((g, i) => ({ id: g.value, name: g.fields?.Name, n: x.fields.AmountIngredient[i] })).filter(g => g.id && g.n),
    }));
  } catch { it.recipes = []; it.recipeError = true; }
  it.patch = await patchFor('item', id);
  it.gameVersion = await gameVersion(data.version);
  return it;
}

// ---------- duty ----------
export async function getDuty(id) {
  const fields = 'Name,ClassJobLevelRequired,ClassJobLevelSync,ItemLevelRequired,ItemLevelSync,ContentType.Name,ContentMemberType.TanksPerParty,ContentMemberType.HealersPerParty,ContentMemberType.MeleesPerParty,ContentMemberType.RangedPerParty,TerritoryType.PlaceName.Name,Content@as(raw),HighEndDuty,LevelingRoulette';
  const { data, fetchedAt, cached } = await getJSON(`${XIV}/sheet/ContentFinderCondition/${id}?fields=${fields}`);
  const f = data.fields, m = f.ContentMemberType?.fields || {};
  const d = { id, version: data.version, fetchedAt, cached, name: f.Name, type: f.ContentType?.fields?.Name, lvl: f.ClassJobLevelRequired, sync: f.ClassJobLevelSync,
    ilvl: f.ItemLevelRequired, ilvlSync: f.ItemLevelSync, zone: f.TerritoryType?.fields?.PlaceName?.fields?.Name, highEnd: !!f.HighEndDuty, roulette: !!f.LevelingRoulette,
    party: { tank: m.TanksPerParty, healer: m.HealersPerParty, melee: m.MeleesPerParty, ranged: m.RangedPerParty }, desc: data.transient?.Description };
  d.patch = await patchFor('instance', f['Content@as(raw)']);
  d.gameVersion = await gameVersion(data.version);
  return d;
}

/** Duties in a level range, optionally for one content type name (e.g. "Dungeons"). */
export async function listDuties(lo, hi, type) {
  let q = `+ClassJobLevelRequired>=${lo} +ClassJobLevelRequired<=${hi}`;
  if (type) q += ` +ContentType.Name="${clean(type)}"`;
  const { data } = await getJSON(`${XIV}/search?` + qs({ sheets: 'ContentFinderCondition', query: q, fields: 'Name,ContentType.Name,ClassJobLevelRequired', limit: 40 }));
  return data.results.filter(r => r.fields.Name).map(r => ({ id: r.row_id, name: r.fields.Name, type: r.fields.ContentType?.fields?.Name, lvl: r.fields.ClassJobLevelRequired }))
    .sort((a, b) => a.lvl - b.lvl || a.name.localeCompare(b.name));
}

/** Quests whose first required class level equals `lvl` (job/class quests at your level). */
export async function questsAtLevel(lvl) {
  const { data } = await getJSON(`${XIV}/search?` + qs({ sheets: 'Quest', query: `ClassJobLevel[]=${lvl}`, fields: 'Name,ClassJobCategory0.Name,PlaceName.Name,ClassJobLevel', limit: 30 }));
  return data.results.filter(r => r.fields.Name && (r.fields.ClassJobLevel || [])[0] === lvl)
    .map(r => ({ id: r.row_id, name: r.fields.Name, cat: r.fields.ClassJobCategory0?.fields?.Name, zone: r.fields.PlaceName?.fields?.Name }));
}

// ---------- market (Universalis) ----------
export async function getWorlds() {
  const [dcs, worlds] = await Promise.all([getJSON(UNI + '/data-centers', TTL.meta), getJSON(UNI + '/worlds', TTL.meta)]);
  const wn = Object.fromEntries(worlds.data.map(w => [w.id, w.name]));
  return dcs.data.map(d => ({ name: d.name, region: d.region, worlds: d.worlds.map(i => wn[i]).filter(Boolean).sort() }))
    .sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
}

export async function getPrice(itemId, scope) {
  try {
    const { data, fetchedAt, cached, stale } = await getJSON(`${UNI}/${encodeURIComponent(scope)}/${itemId}?listings=5&entries=5`, TTL.market);
    return { ok: true, scope, fetchedAt, cached, stale, d: data };
  } catch (e) {
    if (e.status === 404) return { ok: false, reason: 'notfound' };
    return { ok: false, reason: 'error', msg: e.message };
  }
}
