import {readFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
const keys=[];
for(const stage of ['young','adult','veteran'])for(const cls of ['barbarian','fighter','wizard','cleric','bard','ranger'])keys.push(`${stage}/${cls}`);
keys.push('enemy/brote','enemy/caparazon');
const size=100,rowHeight=120,labelWidth=180;
const pieces=[];
for(const [index,key]of keys.entries()){
 const png=join(root,'public/pet/combat',`${key}.png`);
 const entry=JSON.parse(readFileSync(png.replace('.png','.json'),'utf8'));
 const title=Buffer.from(`<svg width="${labelWidth}" height="${rowHeight}"><text x="8" y="45" fill="#ffffff" font-family="Arial" font-size="16">${key}</text><text x="8" y="68" fill="#bac9c9" font-family="Arial" font-size="12">frame 4 / 7 per animation</text></svg>`);
 pieces.push({input:title,left:0,top:index*rowHeight});
 let column=0;
 for(const name of ['idle','attack','hurt','ko','guard',key.endsWith('brote')?'charge':'vulnerable']){
  const anim=entry.anims[name];if(!anim)continue;
  for(const frame of [4,7]){
   const input=await sharp(png).extract({left:frame*entry.cell,top:anim.row*entry.cell,width:entry.cell,height:entry.cell}).resize(size,size,{kernel:'nearest'}).png().toBuffer();
   pieces.push({input,left:labelWidth+column*size,top:index*rowHeight+20});column++;
  }
  pieces.push({input:Buffer.from(`<svg width="200" height="20"><text x="5" y="15" fill="#ffffff" font-family="Arial" font-size="13">${name}</text></svg>`),left:labelWidth+(column-2)*size,top:index*rowHeight});
 }
}
const dir=join(root,'.superpowers/brainstorm/2026-09-06-r3');mkdirSync(dir,{recursive:true});
await sharp({create:{width:labelWidth+12*size,height:keys.length*rowHeight,channels:4,background:'#253638'}}).composite(pieces).png().toFile(join(dir,'combat-contact.png'));
console.log(join(dir,'combat-contact.png'));
