// Checks every required R3 asset against disk, dimensions and content hashes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {sheetHash} from './sheet-postprocess.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
const keys=[];
for(const stage of ['young','adult','veteran'])for(const cls of ['barbarian','fighter','wizard','cleric','bard','ranger'])keys.push(`${stage}/${cls}`);
keys.push('enemy/brote','enemy/caparazon');
for(const key of keys){
 const file=join(root,'public/pet/combat',key);
 const entry=JSON.parse(readFileSync(`${file}.json`,'utf8'));
 assert.equal(entry.hash,sheetHash(`${file}.png`));
 const image=await sharp(`${file}.png`).metadata();
 assert.equal(entry.width,image.width);assert.equal(entry.height,image.height);
 const names=['idle','attack','hurt','ko',...(key.startsWith('enemy/')?['guard',key.endsWith('brote')?'charge':'vulnerable']:[])];
 for(const name of names){const row=entry.anims[name];assert(row,`${key}/${name}`);assert.equal(row.frames,8);assert((row.row+1)*entry.cell<=entry.height);assert(row.frames*entry.cell<=entry.width);}
 const {data,info}=await sharp(`${file}.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let edgePixels=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if((x%entry.cell===0 || x%entry.cell===entry.cell-1 || y%entry.cell===0 || y%entry.cell===entry.cell-1) && data[(y*info.width+x)*4+3]>0)edgePixels++;
 if(edgePixels)console.log('REVIEW CELL EDGE',key,edgePixels);
}
console.log('20 combat sheets verified: hashes, dimensions, 84 animation rows.');
