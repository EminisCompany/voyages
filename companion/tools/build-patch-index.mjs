// Builds data/patch-index.json from Teamcraft's open data (MIT licensed).
// Run: node tools/build-patch-index.mjs
import { writeFileSync } from 'node:fs';
const B = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/master/libs/data/src/lib/json/';
const get = async f => { const r = await fetch(B + f); if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); };
const [names, content, itemPatch] = await Promise.all([get('patch-names.json'), get('patch-content.json'), get('item-patch.json')]);
const patches = {};
for (const [id, p] of Object.entries(names)) patches[id] = p.version;
const quest = {}, instance = {};
for (const [pid, kinds] of Object.entries(content)) {
  for (const id of kinds.quest || []) quest[id] = +pid;
  for (const id of kinds.instance || kinds.instancecontent || []) instance[id] = +pid;
}
const out = { generated: new Date().toISOString(), source: 'Teamcraft open data (MIT) patch-names / patch-content / item-patch', patches, quest, item: itemPatch, instance };
writeFileSync(new URL('../data/patch-index.json', import.meta.url), JSON.stringify(out));
console.log('patches', Object.keys(patches).length, 'quests', Object.keys(quest).length, 'items', Object.keys(itemPatch).length, 'instances', Object.keys(instance).length);
const kinds = new Set(); Object.values(content).forEach(k => Object.keys(k).forEach(x => kinds.add(x))); console.log([...kinds].join(','));
