// Extract only combat rows, leaving companion sheets and their hitboxes untouched.
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {compressSheet,sheetHash} from './sheet-postprocess.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
export async function exportCombat(id,key,names=['idle','attack','hurt','ko']) {
  const temp=join(root,'.superpowers/brainstorm/2026-09-06-r3',key);
  mkdirSync(temp,{recursive:true});
  const response=await fetch(`https://api.pixellab.ai/mcp/characters/${id}/spritesheet`);
  if(!response.ok) throw new Error(`sheet ${key}: ${response.status}`);
  writeFileSync(join(temp,'sheet.zip'),Buffer.from(await response.arrayBuffer()));
  execFileSync('tar',['-xf',join(temp,'sheet.zip'),'-C',temp]);
  const layout=JSON.parse(readFileSync(join(temp,readdirSync(temp).find(f=>f.endsWith('.json'))),'utf8')).spritesheet;
  const source=join(temp,readdirSync(temp).find(f=>f.endsWith('.png')));
  const sourceWidth=layout.cell_size.width;
  const sourceHeight=layout.cell_size.height;
  const cell=Math.max(sourceWidth,sourceHeight);
  const rows=names.map(name=> {
    const candidates=layout.rows.filter(r=>r.type==='animation' && [ `battle-${name}`, `battle-${name}-v2`, `battle-${name}-v3` ].includes(r.animation) && r.direction===(key.startsWith('enemy')?'west':'east'));
    const row=candidates.find(r=>r.animation.endsWith('-v3')) ?? candidates.find(r=>r.animation.endsWith('-v2')) ?? candidates[0];
    if(!row)throw new Error(`${key} missing ${name}`);
    return row;
  });
  const frames=Math.max(...rows.map(r=>r.frame_count));
  // PixelLab may return rectangular cells after interpolation; preserve every pixel,
  // adding transparent padding around each frame to keep the runtime square contract.
  const pieces=(await Promise.all(rows.map(async(row,index)=>Promise.all(Array.from({length:row.frame_count},async(_,frame)=>({input:await sharp(source).extract({left:frame*sourceWidth,top:row.row*sourceHeight,width:sourceWidth,height:sourceHeight}).png().toBuffer(),left:frame*cell+Math.floor((cell-sourceWidth)/2),top:index*cell+Math.floor((cell-sourceHeight)/2)})))))).flat();
  const path=join(root,'public/pet/combat',`${key}.png`);
  mkdirSync(dirname(path),{recursive:true});
  await sharp({create:{width:frames*cell,height:rows.length*cell,channels:4,background:'#00000000'}}).composite(pieces).png().toFile(path);
  await compressSheet(path);
  const entry={src:`/pet/combat/${key}.png`,hash:sheetHash(path),cell,width:frames*cell,height:rows.length*cell,anims:Object.fromEntries(names.map((name,i)=>[name,{row:i,frames:rows[i].frame_count}]))};
  writeFileSync(path.replace('.png','.json'),JSON.stringify(entry,null,2)+'\n');
  return entry;
}
if(process.argv[1]?.endsWith('combat-export.mjs')) console.log(JSON.stringify(await exportCombat(process.argv[2],process.argv[3])));
