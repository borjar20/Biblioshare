const fs=require('fs'),path=require('path'),sharp=require('sharp');
const REPO=path.join(__dirname,'../../public/pet/'),ART=path.join(__dirname,'art/');
fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});
(async()=>{
const files={};const put=(rel)=>{files['pl/'+rel]='public/pet/'+rel;return 'pl/'+rel};
async function colors(f){const {data}=await sharp(REPO+f).ensureAlpha().raw().toBuffer({resolveWithObject:true});const s=new Set();for(let i=0;i<data.length;i+=4)if(data[i+3])s.add((data[i]<<16)|(data[i+1]<<8)|data[i+2]);return s.size}
const META={sheets:{},combat:{},scenes:{},loot:{},fx:{},badges:{},ui:{}};
for(const st of ['young','adult','veteran']){META.sheets[st]={};META.combat[st]={};
 for(const c of ['barbarian','fighter','wizard','cleric','bard','ranger']){
  const j=JSON.parse(fs.readFileSync(REPO+`sheets/${st}/${c}.json`));const rows={};for(const r of j.spritesheet.rows)if(r.type==='animation')rows[r.animation]={row:r.row,n:r.frame_count};
  META.sheets[st][c]={src:put(`sheets/${st}/${c}.png`),cell:j.spritesheet.cell_size.width,rows,colors:await colors(`sheets/${st}/${c}.png`),kb:Math.round(fs.statSync(REPO+`sheets/${st}/${c}.png`).size/1024)};
  const k=JSON.parse(fs.readFileSync(REPO+`combat/${st}/${c}.json`));
  META.combat[st][c]={src:put(`combat/${st}/${c}.png`),cell:k.cell,anims:k.anims,colors:await colors(`combat/${st}/${c}.png`),kb:Math.round(fs.statSync(REPO+`combat/${st}/${c}.png`).size/1024)};
 }}
for(const s of ['camp','camp-portrait','battle','gathering']){const m=await sharp(REPO+`scenes/${s}.webp`).metadata();META.scenes[s]={src:put(`scenes/${s}.webp`),w:m.width,h:m.height}}
for(const k of ['sharp_bookmark','heavy_ink_quill','librarian_loupe','last_page_amulet','loan_pendant','streak_medallion'])META.loot[k]=put(`loot/${k}.png`);
for(const k of ['damage','shield','heal','cooldown','vulnerability'])META.fx[k]=put(`loot/fx/${k}.png`);
for(const k of ['finished','sessions','streak','reviews','notes','posts','genres','sagas','episodes','missions','stage'])META.badges[k]=put(`badges/${k}.png`);
for(const k of ['frame-moss','frame-wood','frame-parchment','plank-normal','plank-hover','plank-pressed'])META.ui[k]=put(`ui/${k}.webp`);
const art=['engine','pet','world','items'].map(f=>fs.readFileSync(ART+f+'.js','utf8')).join('\n');
let html=fs.readFileSync(path.join(__dirname,'demo-template.html'),'utf8').replace('/*ART*/',()=>art).replace('/*META*/',()=>JSON.stringify(META));
fs.writeFileSync(path.join(__dirname,'out/mascota-a-mano.html'),html);fs.writeFileSync(path.join(__dirname,'out/files.json'),JSON.stringify(files));
console.log('ok',html.length,Object.keys(files).length);
})();
