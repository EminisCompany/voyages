import * as api from './api.js';

// ---------- tiny DOM helpers (all API text goes through textContent: no HTML injection) ----------
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') throw new Error('no raw html');
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
const icon = (id, cls) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); if (cls) s.setAttribute('class', cls); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id); s.append(u); return s; };
const $view = document.getElementById('view');

// ---------- settings ----------
const JOBS = {
  tank: ['PLD', 'WAR', 'DRK', 'GNB'], healer: ['WHM', 'SCH', 'AST', 'SGE'],
  dps: ['MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR', 'BRD', 'MCH', 'DNC', 'BLM', 'SMN', 'RDM', 'PCT', 'BLU'],
  craft: ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'], gather: ['MIN', 'BTN', 'FSH'],
};
const roleOf = j => Object.keys(JOBS).find(r => JOBS[r].includes(j));
const defaults = { job: '', level: 1, spoilers: 'off', scope: 'Chaos', tracked: [] };
let S = (() => { try { return { ...defaults, ...JSON.parse(localStorage.getItem('cmp:settings')) }; } catch { return { ...defaults }; } })();
const save = () => { try { localStorage.setItem('cmp:settings', JSON.stringify(S)); } catch {} applyAccent(); };
function applyAccent() {
  const r = roleOf(S.job), col = { tank: '--tank', healer: '--healer', dps: '--dps', craft: '--craft', gather: '--gather' }[r];
  document.documentElement.style.setProperty('--accent', col ? `var(${col})` : 'var(--gold)');
  const b = document.getElementById('jobBadge'); b.hidden = !S.job; b.textContent = S.job ? `${S.job} ${S.level}` : '';
}

// ---------- shared UI pieces ----------
const GLYPH = { Quest: 'g-quest', Item: 'g-item', ContentFinderCondition: 'g-duty' };
const KIND_LABEL = { Quest: 'Quests', Item: 'Items', ContentFinderCondition: 'Duties' };
const ROUTE = { Quest: 'quest', Item: 'item', ContentFinderCondition: 'duty' };
const go = hash => { location.hash = hash; };
const spin = msg => h('div', { class: 'empty' }, h('span', { class: 'spin' }), msg || 'Looking it up…');
const noAnswer = (why) => h('div', { class: 'card' }, h('h2', {}, 'No verified answer'),
  h('p', {}, why || 'Nothing matching that was found in the game data, so nothing is shown rather than guessing.'));
const ago = ms => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };

function sourceChips(o, extra = []) {
  return h('div', { class: 'chips' },
    h('span', { class: 'chip src' }, 'Source: XIVAPI v2'),
    o.gameVersion && h('span', { class: 'chip patch' }, `Game data v${o.gameVersion}`),
    o.patch ? h('span', { class: 'chip patch' }, `Added in patch ${o.patch}`) : h('span', { class: 'chip warn' }, 'Added-in patch: not in Teamcraft data'),
    o.patch && h('span', { class: 'chip src' }, 'Patch via Teamcraft'),
    o.cached && h('span', { class: 'chip' }, 'cached ' + ago(o.fetchedAt)), extra);
}
const kv = rows => h('dl', { class: 'kv' }, rows.filter(r => r[1] != null && r[1] !== '').flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
const link = (txt, hash) => h('button', { class: 'link', onclick: () => go(hash) }, txt);
const resButton = (kind, id, title, sub) => h('button', { class: 'res', onclick: () => go(`#/${ROUTE[kind]}/${id}`) }, icon(GLYPH[kind]), h('span', {}, h('span', { class: 't' }, title), sub && h('span', { class: 's' }, sub)));

// ---------- views ----------
let token = 0;
function show(...nodes) { $view.replaceChildren(...nodes); }

// Search / chat tab
function viewSearch(q = '') {
  const input = h('input', { class: 'field', type: 'search', placeholder: 'Quest, item, recipe or duty name…', value: q, 'aria-label': 'Search', enterkeyhint: 'search', autocomplete: 'off', autocapitalize: 'off' });
  const out = h('div');
  const run = async () => {
    const v = input.value.trim(); history.replaceState(null, '', '#/search/' + encodeURIComponent(v));
    if (v.length < 2) { out.replaceChildren(); return; }
    const t = ++token; out.replaceChildren(spin('Searching game data…'));
    try {
      const { results, version } = await api.search(v);
      if (t !== token) return;
      if (!results.length) { out.replaceChildren(noAnswer(`No quest, item or duty name contains “${v}”. Check the spelling (names are the English in-game names).`)); return; }
      const nodes = [];
      for (const k of ['Quest', 'Item', 'ContentFinderCondition']) {
        const rs = results.filter(r => r.kind === k).sort((a, b) => b.score - a.score);
        if (!rs.length) continue;
        nodes.push(h('div', { class: 'group' }, KIND_LABEL[k]), h('div', { class: 'list' }, rs.map(r => resButton(k, r.id, r.f.Name,
          k === 'Quest' ? [r.f.Expansion?.fields?.Name, r.f.PlaceName?.fields?.Name].filter(Boolean).join(' · ') :
          k === 'Item' ? [r.f.ItemUICategory?.fields?.Name, r.f['LevelItem@as(raw)'] ? 'i' + r.f['LevelItem@as(raw)'] : ''].filter(Boolean).join(' · ') :
          [r.f.ContentType?.fields?.Name, r.f.ClassJobLevelRequired ? 'Lv ' + r.f.ClassJobLevelRequired : ''].filter(Boolean).join(' · ')))));
      }
      out.replaceChildren(...nodes, h('div', { class: 'chips' }, h('span', { class: 'chip src' }, 'Source: XIVAPI v2')));
    } catch (e) { if (t === token) out.replaceChildren(noAnswer('Could not reach XIVAPI (' + e.message + '). Recently viewed cards still work offline.')); }
  };
  let timer; input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
  show(h('h1', {}, 'Ask the archive'),
    h('p', { class: 'lead' }, 'Search any quest, item, recipe or duty. Answers come straight from game data, with the source and patch shown. No guessing.'),
    h('div', { class: 'searchbar' }, icon('i-search'), input), out);
  if (q) run();
}

// Quest card
async function viewQuest(id) {
  show(spin());
  let q; try { q = await api.getQuest(id); } catch (e) { show(noAnswer(e.status === 404 ? 'That quest id is not in the game data.' : 'Could not load that quest: ' + e.message)); return; }
  const tracked = S.tracked.find(t => t.id === id);
  const story = S.spoilers === 'off' ? [] : S.spoilers === 'light' ? q.story.slice(0, 1) : q.story;
  const card = h('article', { class: 'card' },
    h('h1', {}, q.name),
    h('div', { class: 'chips' }, q.expansion && h('span', { class: 'chip' }, q.expansion), q.genre && h('span', { class: 'chip' }, q.genre)),
    kv([['Level', q.level ? 'Lv ' + q.level : null], ['Job', q.category], ['Start NPC', q.npc], ['Zone', q.zone],
      ['Location', q.where && `${q.where.area} (${q.where.x}, ${q.where.y})`],
      ['Requires first', q.prev.length ? h('span', {}, q.prev.map((p, i) => [i ? ', ' : '', link(p.name, '#/quest/' + p.id)])) : 'Nothing: no prerequisite quest'],
      ['Gil', q.gil || null]]),
    h('h3', {}, 'Steps'),
    q.steps.length ? h('ol', {}, q.steps.map(s => h('li', {}, s))) : h('p', { class: 'muted' }, q.textMissing ? 'Objective text could not be loaded.' : 'No objective text in the game data for this quest.'),
    story.length ? [h('h3', {}, 'Story summary'), story.map(s => h('p', { class: 'quote' }, s))]
      : q.story.length ? h('p', { class: 'muted' }, `Story summary hidden (spoilers: ${S.spoilers}). Change it in Profile.`) : null,
    q.rewards.length ? [h('h3', {}, 'Rewards'), h('p', {}, q.rewards.map((r, i) => [i ? ', ' : '', link(r.name, '#/item/' + r.id)]))] : null,
    sourceChips(q),
    h('div', { class: 'row' },
      h('button', { class: 'btn solid', onclick: () => { toggleTrack(q); viewQuest(id); } }, tracked ? 'Stop tracking' : 'Track in Planner')));
  const next = h('div');
  show(card, next);
  try {
    const nx = await api.nextQuests(id);
    if (!nx.length) { next.append(h('div', { class: 'note' }, 'No quest lists this as a prerequisite in the game data.')); return; }
    if (S.spoilers === 'off') {
      const b = h('button', { class: 'btn', onclick: () => { b.replaceWith(nextList(nx)); } }, `Show ${nx.length} follow-up quest${nx.length > 1 ? 's' : ''} (may spoil)`);
      next.append(h('h2', {}, 'What this unlocks'), b);
    } else next.append(h('h2', {}, 'What this unlocks'), nextList(nx));
  } catch { /* follow-ups are optional */ }
}
const nextList = nx => h('div', { class: 'list' }, nx.map(n => resButton('Quest', n.id, n.name, n.level ? 'Lv ' + n.level : '')));
function toggleTrack(q) {
  const i = S.tracked.findIndex(t => t.id === q.id);
  if (i >= 0) S.tracked.splice(i, 1); else S.tracked.push({ id: q.id, name: q.name, done: false });
  save();
}

// Item card (+ recipe + price)
async function viewItem(id) {
  show(spin());
  let it; try { it = await api.getItem(id); } catch (e) { show(noAnswer(e.status === 404 ? 'That item id is not in the game data.' : 'Could not load that item: ' + e.message)); return; }
  const price = h('div');
  const card = h('article', { class: 'card' },
    h('h1', {}, it.name), h('div', { class: 'chips' }, it.category && h('span', { class: 'chip' }, it.category), it.untradable && h('span', { class: 'chip warn' }, 'Untradable')),
    it.desc && h('p', {}, it.desc),
    kv([['Item level', it.ilvl || null], ['Stack size', it.stack > 1 ? it.stack : null], ['HQ possible', it.hq ? 'Yes' : null], ['Vendor sell price', it.vendorPrice ? it.vendorPrice + ' gil' : null]]),
    sourceChips(it));
  const rec = it.recipes.length ? it.recipes.map(r => h('article', { class: 'card' },
    h('h2', {}, `Recipe: ${r.craft}, Lv ${r.level}`), h('p', { class: 'muted' }, `Makes ${r.yields} per craft`),
    h('ol', {}, r.ingredients.map(g => h('li', {}, `${g.n}× `, link(g.name, '#/item/' + g.id)))),
    h('div', { class: 'chips' }, h('span', { class: 'chip src' }, 'Source: XIVAPI v2 (Recipe)'), it.gameVersion && h('span', { class: 'chip patch' }, `Game data v${it.gameVersion}`),
      it.patch && h('span', { class: 'chip patch' }, `Item added in patch ${it.patch}`)))) : [];
  show(card, ...rec, it.recipeError ? h('div', { class: 'note' }, 'Recipes could not be loaded right now.') : null, price);
  if (it.untradable) price.append(h('div', { class: 'note' }, 'Untradable: it has no market board price.'));
  else priceCard(price, id, it.name);
}

async function priceCard(host, id, name) {
  host.replaceChildren(spin('Fetching market prices…'));
  const p = await api.getPrice(id, S.scope);
  if (!p.ok) { host.replaceChildren(p.reason === 'notfound' ? noAnswer(`Universalis has no market data for this item on ${S.scope} (it may not be sellable on the market board).`) : noAnswer('Could not reach Universalis: ' + p.msg)); return; }
  const d = p.d, gil = n => n ? Math.round(n).toLocaleString() + ' gil' : '–';
  const age = d.lastUploadTime ? ago(d.lastUploadTime) : null, old = d.lastUploadTime && Date.now() - d.lastUploadTime > 864e5;
  const multi = d.worldName == null;
  host.replaceChildren(h('article', { class: 'card' },
    h('h2', {}, `Market price on ${p.scope}`),
    d.listingsCount ? null : h('p', { class: 'muted' }, 'No active listings.'),
    h('div', { class: 'price' },
      h('div', {}, h('small', {}, 'Lowest NQ'), h('b', {}, gil(d.minPriceNQ))), h('div', {}, h('small', {}, 'Lowest HQ'), h('b', {}, gil(d.minPriceHQ))),
      h('div', {}, h('small', {}, 'Avg listing'), h('b', {}, gil(d.currentAveragePrice))), h('div', {}, h('small', {}, 'Sold per day'), h('b', {}, d.regularSaleVelocity ? d.regularSaleVelocity.toFixed(1) : '–'))),
    d.listings?.length ? [h('h3', {}, 'Cheapest listings'), h('table', {}, h('tr', {}, h('th', {}, 'Each'), h('th', {}, 'Qty'), h('th', {}, 'World'), h('th', {}, 'HQ')),
      d.listings.map(l => h('tr', {}, h('td', {}, l.pricePerUnit.toLocaleString()), h('td', {}, l.quantity), h('td', {}, l.worldName || d.worldName || ''), h('td', {}, l.hq ? 'HQ' : ''))))] : null,
    d.recentHistory?.length ? [h('h3', {}, 'Recent sales'), h('table', {}, h('tr', {}, h('th', {}, 'Each'), h('th', {}, 'Qty'), h('th', {}, 'World'), h('th', {}, 'When')),
      d.recentHistory.map(l => h('tr', {}, h('td', {}, l.pricePerUnit.toLocaleString()), h('td', {}, l.quantity), h('td', {}, l.worldName || d.worldName || ''), h('td', {}, ago(l.timestamp * 1000)))))] : null,
    h('p', { class: 'muted' }, 'Player-set prices can be extreme outliers (very low or very high). Compare several listings and sales.'),
    h('div', { class: 'chips' }, h('span', { class: 'chip src' }, 'Source: Universalis'), age && h('span', { class: old ? 'chip warn' : 'chip' }, 'Last upload ' + age),
      p.cached && h('span', { class: 'chip' }, p.stale ? 'offline copy ' + ago(p.fetchedAt) : 'cached ' + ago(p.fetchedAt)), h('span', { class: 'chip' }, 'Prices are live, not tied to a patch')),
    multi ? null : null));
}

// Duty card
async function viewDuty(id) {
  show(spin());
  let d; try { d = await api.getDuty(id); } catch (e) { show(noAnswer(e.status === 404 ? 'That duty is not in the game data.' : 'Could not load that duty: ' + e.message)); return; }
  const p = d.party, party = [p.tank && p.tank + ' tank', p.healer && p.healer + ' healer', p.melee && p.melee + ' melee', p.ranged && p.ranged + ' ranged'].filter(Boolean).join(', ');
  show(h('article', { class: 'card' }, h('h1', {}, d.name),
    h('div', { class: 'chips' }, d.type && h('span', { class: 'chip' }, d.type), d.highEnd && h('span', { class: 'chip warn' }, 'High-end'), d.roulette && h('span', { class: 'chip' }, 'Leveling roulette')),
    kv([['Required level', d.lvl ? 'Lv ' + d.lvl : null], ['Level sync', d.sync ? 'Lv ' + d.sync : null], ['Item level', d.ilvl || null], ['Sync item level', d.ilvlSync || null], ['Location', d.zone], ['Party', party]]),
    d.desc && S.spoilers !== 'off' ? h('p', { class: 'quote' }, d.desc) : d.desc ? h('p', { class: 'muted' }, 'Duty description hidden (spoilers: off). Change it in Profile.') : null,
    sourceChips(d)),
    h('div', { class: 'note' }, 'Boss strategies are not included. No source with a license that allows reuse has been verified for them.'));
}

// Guides tab: duty browser by level (facts only)
let guideState = { type: 'Dungeons', lo: 0, hi: 0 };
function viewGuides() {
  const lvl = +S.level || 1; if (!guideState.hi) { guideState.lo = Math.max(1, lvl - 5); guideState.hi = Math.min(100, Math.max(lvl + 5, 20)); }
  const out = h('div'), types = ['Dungeons', 'Trials', 'Raids', 'Guildhests'];
  const load = async () => {
    out.replaceChildren(spin('Loading duties…'));
    try {
      const r = await api.listDuties(guideState.lo, guideState.hi, guideState.type);
      out.replaceChildren(r.length ? h('div', { class: 'list' }, r.map(x => resButton('ContentFinderCondition', x.id, x.name, `${x.type} · Lv ${x.lvl}`))) : noAnswer('No duties of this type in that level range.'),
        h('div', { class: 'chips' }, h('span', { class: 'chip src' }, 'Source: XIVAPI v2')));
    } catch (e) { out.replaceChildren(noAnswer('Could not load duties: ' + e.message)); }
  };
  const lo = h('input', { class: 'field', type: 'number', inputmode: 'numeric', min: 1, max: 100, value: guideState.lo, 'aria-label': 'From level' });
  const hi = h('input', { class: 'field', type: 'number', inputmode: 'numeric', min: 1, max: 100, value: guideState.hi, 'aria-label': 'To level' });
  const upd = () => { guideState.lo = +lo.value || 1; guideState.hi = +hi.value || 100; load(); };
  lo.addEventListener('change', upd); hi.addEventListener('change', upd);
  const chips = h('div', { class: 'chips' }, types.map(t => h('button', { class: 'chip', 'aria-pressed': t === guideState.type, onclick: e => { guideState.type = t; [...chips.children].forEach(c => c.setAttribute('aria-pressed', c === e.currentTarget)); load(); } }, t)));
  show(h('h1', {}, 'Duty guides'), h('p', { class: 'lead' }, 'Level, sync, party makeup and location for each duty, from game data.'), chips,
    h('div', { class: 'row' }, h('div', { style: 'flex:1' }, lo), h('div', { style: 'flex:1' }, hi)), out,
    h('div', { class: 'note' }, 'Job guides and boss strategies are not included yet: no source whose license allows reuse has been verified.'));
  load();
}

// Planner tab
function viewPlanner() {
  const lvl = +S.level || 1, atLvl = h('div');
  const tracked = h('div');
  const draw = () => {
    tracked.replaceChildren(S.tracked.length ? h('div', { class: 'list' }, S.tracked.map(t => {
      const box = h('div', { class: 'card' }, h('h2', {}, t.name), h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => go('#/quest/' + t.id) }, 'Open'),
        h('button', { class: 'btn small solid', onclick: async () => { t.done = true; save(); await showNext(box, t); draw2(); } }, t.done ? 'Done ✓' : 'Mark done'),
        h('button', { class: 'btn small', onclick: () => { S.tracked = S.tracked.filter(x => x !== t); save(); draw(); } }, 'Remove')));
      if (t.done) showNext(box, t); return box;
    })) : h('div', { class: 'note' }, 'Nothing tracked yet. Open a quest from Search and tap “Track in Planner”.'));
  };
  const draw2 = () => {};
  const showNext = async (box, t) => {
    if (box.querySelector('.next')) return;
    const n = h('div', { class: 'next' }); box.append(n);
    try {
      const nx = await api.nextQuests(t.id);
      n.append(h('h3', {}, 'Next up'), nx.length ? nextList(nx) : h('p', { class: 'muted' }, 'No follow-up quest is listed for this one in the game data.'));
    } catch { n.append(h('p', { class: 'muted' }, 'Could not look up follow-ups right now.')); }
  };
  draw();
  show(h('h1', {}, 'What next?'), h('p', { class: 'lead' }, 'Track quests, mark them done, and see which quests they unlock. Progress is stored on this device only.'),
    h('h2', {}, 'Tracked quests'), tracked,
    h('h2', { style: 'margin-top:18px' }, `Quests that start at level ${lvl}`), atLvl);
  atLvl.replaceChildren(spin());
  api.questsAtLevel(lvl).then(r => atLvl.replaceChildren(r.length ? h('div', { class: 'list' }, r.map(x => resButton('Quest', x.id, x.name, [x.cat, x.zone].filter(Boolean).join(' · '))))
    : noAnswer(`No quests with a level ${lvl} requirement found.`), h('div', { class: 'chips' }, h('span', { class: 'chip src' }, 'Source: XIVAPI v2'))))
    .catch(e => atLvl.replaceChildren(noAnswer('Could not load quests: ' + e.message)));
}

// Market tab
function viewMarket(q = '') {
  const input = h('input', { class: 'field', type: 'search', placeholder: 'Item name, e.g. Potion…', value: q, 'aria-label': 'Item search' });
  const out = h('div'); let timer;
  const run = async () => {
    const v = input.value.trim(); if (v.length < 2) { out.replaceChildren(); return; }
    const t = ++token; out.replaceChildren(spin('Searching…'));
    try {
      const { results } = await api.search(v, ['Item'], { Item: 12 });
      if (t !== token) return;
      out.replaceChildren(results.length ? h('div', { class: 'list' }, results.map(r => resButton('Item', r.id, r.f.Name, r.f.ItemUICategory?.fields?.Name))) : noAnswer(`No item named “${v}”.`));
    } catch (e) { out.replaceChildren(noAnswer('Search failed: ' + e.message)); }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
  show(h('h1', {}, 'Market board'), h('p', { class: 'lead' }, `Live prices for ${S.scope}. Change the world or data center in Profile.`),
    h('div', { class: 'searchbar' }, icon('i-search'), input), out,
    h('div', { class: 'chips' }, h('span', { class: 'chip src' }, 'Prices: Universalis')));
  if (q) run();
}

// Profile tab
async function viewProfile() {
  const jobsBox = h('div'), lvl = h('input', { class: 'field', type: 'number', inputmode: 'numeric', min: 1, max: 100, value: S.level, 'aria-label': 'Level' });
  const drawJobs = () => jobsBox.replaceChildren(...Object.entries({ Tank: 'tank', Healer: 'healer', 'DPS': 'dps', Crafter: 'craft', Gatherer: 'gather' }).flatMap(([lab, r]) =>
    [h('label', { class: 'l' }, lab), h('div', { class: 'jobs' }, JOBS[r].map(j => h('button', { 'aria-pressed': S.job === j, onclick: () => { S.job = S.job === j ? '' : j; save(); drawJobs(); } }, j)))]));
  drawJobs();
  lvl.addEventListener('change', () => { S.level = Math.min(100, Math.max(1, +lvl.value || 1)); save(); });
  const sp = h('div', { class: 'seg' }, ['off', 'light', 'full'].map(v => h('button', { 'aria-pressed': S.spoilers === v, onclick: e => { S.spoilers = v; save(); [...sp.children].forEach(c => c.setAttribute('aria-pressed', c === e.currentTarget)); } }, v[0].toUpperCase() + v.slice(1))));
  const scope = h('select', { class: 'field', 'aria-label': 'World or data center' }, h('option', { value: S.scope }, S.scope));
  scope.addEventListener('change', () => { S.scope = scope.value; save(); });
  show(h('h1', {}, 'Profile'), h('p', { class: 'lead' }, 'Stored only on this device. The accent color follows your job role.'),
    h('label', { class: 'l' }, 'Spoilers'), sp,
    h('p', { class: 'muted' }, 'Off hides story summaries, duty descriptions and follow-up quest names. Light shows one summary line. Full shows everything.'),
    h('label', { class: 'l' }, 'Market world / data center'), scope,
    h('label', { class: 'l' }, 'Current level'), lvl, jobsBox,
    h('div', { class: 'note' }, 'Lodestone character import is not built: Lodestone sends no CORS headers, so a browser-only app cannot read it without a proxy. Enter job and level by hand for now.'),
    h('div', { class: 'credits' }, 'Data: ', h('a', { href: 'https://xivapi.com', target: '_blank', rel: 'noopener' }, 'XIVAPI v2'), ' (game data), ',
      h('a', { href: 'https://universalis.app', target: '_blank', rel: 'noopener' }, 'Universalis'), ' (market), ',
      h('a', { href: 'https://github.com/ffxiv-teamcraft/ffxiv-teamcraft', target: '_blank', rel: 'noopener' }, 'FFXIV Teamcraft'), ' open data (MIT, patch numbers). ',
      'FINAL FANTASY is a registered trademark of Square Enix. This is an unofficial fan tool; it uses no Square Enix art or logos and never touches the game client.'));
  try {
    const dcs = await api.getWorlds(), cur = S.scope;
    scope.replaceChildren(...dcs.map(d => h('optgroup', { label: `${d.region}: ${d.name}` }, h('option', { value: d.name, selected: cur === d.name }, `${d.name} (whole data center)`), d.worlds.map(w => h('option', { value: w, selected: cur === w }, w)))));
  } catch { /* keep current value only */ }
}

// ---------- router + tabs ----------
const TABS = [['search', 'Search', 'i-search'], ['guides', 'Guides', 'i-book'], ['planner', 'Planner', 'i-route'], ['market', 'Market', 'i-coin'], ['profile', 'Profile', 'i-user']];
const tabs = document.getElementById('tabs');
tabs.append(...TABS.map(([k, label, ic]) => h('button', { 'data-tab': k, onclick: () => go('#/' + k) }, icon(ic), label)));
function route() {
  const [, a = 'search', b = ''] = location.hash.split('/'), arg = decodeURIComponent(b);
  const tab = { quest: 'search', item: 'search', duty: 'guides' }[a] || a;
  tabs.querySelectorAll('button').forEach(x => x.toggleAttribute('aria-current', x.dataset.tab === tab) || x.removeAttribute('aria-current'));
  tabs.querySelectorAll('button').forEach(x => x.dataset.tab === tab ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'));
  token++; window.scrollTo(0, 0);
  const id = +arg;
  ({ search: () => viewSearch(arg), quest: () => viewQuest(id), item: () => viewItem(id), duty: () => viewDuty(id), guides: viewGuides, planner: viewPlanner, market: () => viewMarket(arg), profile: viewProfile }[a] || (() => viewSearch()))();
}
window.addEventListener('hashchange', route);
applyAccent(); route();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
