// Resumable R3 generation. IDs are persisted immediately; reruns skip submitted jobs.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pixelTool} from './mcp.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const path=join(here,'combat-characters.json');
const ledger=JSON.parse(readFileSync(path,'utf8'));
const characters=JSON.parse(readFileSync(join(here,'characters.json'),'utf8'));
const attack={fighter:'slash the held sword forward and recover, shield held beside chest',barbarian:'swing the held axe in a strong forward chop and recover',wizard:'point the held crystal staff forward to cast a spell and recover',cleric:'swing the held holy mace forward and recover',bard:'strum the held lute vigorously to project a musical spell and recover',ranger:'draw the held bow, release one arrow forward, and recover'};
const common={idle:'combat ready breathing idle, subtle breathing and tail sway, keeping clothing and held equipment steady',hurt:'briefly recoil from a hit to the chest, lean backward, regain balance and return upright, keeping held equipment',ko:'defeated gentle collapse onto knees then lying down, eyes closed, equipment remains beside body, final pose resting still'};
const jobs=[];
for(const stage of ['young','adult','veteran'])for(const [cls,entry] of Object.entries(characters[stage].classes))for(const anim of ['idle','attack','hurt','ko'])jobs.push({key:`${stage}/${cls}/${anim}`,id:entry.character_id,anim,direction:'east',action:anim==='attack'?`attack toward the right: ${attack[cls]}, feet near starting position`:common[anim]});
for(const [enemy,entry] of Object.entries(ledger.enemies))for(const anim of ['idle','attack','hurt','ko','guard',...(enemy==='brote'?['charge']:['vulnerable'])])jobs.push({key:`enemy/${enemy}/${anim}`,id:entry.character_id,anim,direction:'west',action:({idle:'alert breathing idle, slight body bob, feet planted',attack:enemy==='brote'?'lash a vine arm toward the left and recover':'lunge shell and horn toward the left then return',hurt:'briefly recoil backward from a blow and recover',ko:'gently topple onto side defeated, eyes closed, final resting pose',guard:enemy==='brote'?'curl vine arms tightly around body in a defensive guard':'tuck head and legs beneath the armored shell, hold defensive pose',charge:'lean back and wind up both vine arms preparing a powerful strike toward the left',vulnerable:'lift armored shell high exposing soft golden abdomen, hold this open vulnerable pose'})[anim]});
const only=process.argv[2];
// Deliver both enemy silhouettes/telegraphs early so browser verification can start.
jobs.sort((a,b)=>Number(b.key.startsWith('enemy/'))-Number(a.key.startsWith('enemy/')));
// First beetle pass preserved the silhouette too rigidly; stronger motion briefs.
jobs.unshift(...Object.entries({ko:'death roll: beetle rolls completely onto its BACK, all six legs pointing straight UP, shell on the ground, ends upside down motionless',guard:'defensive curl: beetle pulls its head completely INSIDE the shell, folds all six legs underneath, lowers shell flush to the ground, ends as a closed blue dome',vulnerable:'spread wings: beetle raises and opens both blue shell covers widely like butterfly wings, revealing the entire soft bright gold abdomen between them, hold wings wide open'}).map(([anim,action])=>({key:`enemy/caparazon/${anim}-v2`,id:ledger.enemies.caparazon.character_id,anim:`${anim}-v2`,direction:'west',action})));
jobs.unshift({key:'adult/ranger/attack-v2',id:characters.adult.classes.ranger.character_id,anim:'attack-v2',direction:'east',action:'archery shot toward the right: hold the tall wooden bow upright visibly in the forward paw throughout all frames, pull the string with the other paw, release the arrow, return the string hand to rest while still holding the entire bow upright in the forward paw'});
for(const job of jobs){
 if(only && !job.key.startsWith(only))continue;
 if(ledger.animations[job.key])continue;
 try{
  const result=await pixelTool('animate_character',{character_id:job.id,mode:'v3',directions:[job.direction],frame_count:8,keep_first_frame:false,animation_name:`battle-${job.anim}`,action_description:job.action});
  const message=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  const group=message.match(/group: ([\da-f-]+)/)?.[1];
  if(!group)throw new Error(message);
  ledger.animations[job.key]=group;
  writeFileSync(path,JSON.stringify(ledger,null,2)+'\n');
  console.log(job.key,group);
 }catch(error){
  if(error.message.includes('job slots')){
   console.log('Queue full; waiting 45s',job.key);
   await new Promise(resolve=>setTimeout(resolve,45000));
   jobs.splice(jobs.indexOf(job)+1,0,job);
  }else{console.log('Stopped safely:',job.key,error.message);process.exitCode=1;break;}
 }
}
