import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {exportCombat} from './combat-export.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const chars=JSON.parse(readFileSync(join(here,'characters.json'),'utf8'));
const ledger=JSON.parse(readFileSync(join(here,'combat-characters.json'),'utf8'));
for(const stage of ['young','adult','veteran'])for(const [cls,entry] of Object.entries(chars[stage].classes)) {
 try{await exportCombat(entry.character_id,`${stage}/${cls}`);console.log('exported',stage,cls);}catch(error){console.log('pending',stage,cls,error.message);}
}
for(const [enemy,entry]of Object.entries(ledger.enemies)){
 try{await exportCombat(entry.character_id,`enemy/${enemy}`,['idle','attack','hurt','ko','guard',enemy==='brote'?'charge':'vulnerable']);console.log('exported',enemy);}catch(error){console.log('pending',enemy,error.message);}
}
await import('./combat-manifest.mjs');
