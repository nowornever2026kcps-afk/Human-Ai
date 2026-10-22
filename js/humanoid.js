import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {HumanoidBrain} from './humanoid-brain.js';
const $=id=>document.getElementById(id),ACTIVE_KEY='project-human-active-challenge-v1',SAVED_KEY='project-human-challenges-v1';
const brain=new HumanoidBrain();let challenge=null,objects=[],running=false,attemptActive=false,attemptProgress=0,attemptElapsed=0,attemptsThisSession=0,successesThisSession=0,failuresThisSession=0,lastTime=0,walkClock=0,finished=false,autoTraining=false,retryTimer=null,collisionCount=0;
const scene=new THREE.Scene();scene.background=new THREE.Color('#0a1121');scene.fog=new THREE.Fog('#0a1121',24,70);
const camera=new THREE.PerspectiveCamera(48,1,.1,200);camera.position.set(12,12,17);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;$('viewport').appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,1,0);controls.maxPolarAngle=Math.PI*.49;
scene.add(new THREE.HemisphereLight('#c6e8ff','#1a2035',2));const keyLight=new THREE.DirectionalLight('#ffffff',3);keyLight.position.set(-8,15,9);keyLight.castShadow=true;scene.add(keyLight);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#17233a',roughness:.95}));floor.rotation.x=-Math.PI/2;floor.position.y=-.03;floor.receiveShadow=true;scene.add(floor);const grid=new THREE.GridHelper(100,100,'#2c4565','#1b2c46');grid.position.y=0;scene.add(grid);
function marker(color,label){const group=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(.75,.065,10,48),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.65}));ring.rotation.x=Math.PI/2;ring.position.y=.05;group.add(ring);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.045,.09,1.8,10),new THREE.MeshStandardMaterial({color,transparent:true,opacity:.7}));beam.position.y=.9;group.add(beam);group.userData.label=label;scene.add(group);return group}const startMarker=marker('#68e7ad','START'),goalMarker=marker('#a88bff','GOAL');
function makeRobot(){const root=new THREE.Group();const suit=new THREE.MeshStandardMaterial({color:'#55dce8',metalness:.35,roughness:.35}),dark=new THREE.MeshStandardMaterial({color:'#253752',metalness:.45,roughness:.35}),skin=new THREE.MeshStandardMaterial({color:'#d7a98b',roughness:.7}),glow=new THREE.MeshStandardMaterial({color:'#b6fbff',emissive:'#3ccfdf',emissiveIntensity:1.5});function part(geo,mat,pos,parent=root){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}part(new THREE.SphereGeometry(.28,24,18),skin,[0,1.65,0]);part(new THREE.BoxGeometry(.4,.12,.08),glow,[0,1.69,.245]);const torso=part(new THREE.BoxGeometry(.58,.72,.3),suit,[0,1.05,0]);part(new THREE.BoxGeometry(.35,.12,.33),dark,[0,1.44,0]);const waist=part(new THREE.BoxGeometry(.38,.18,.25),dark,[0,.63,0]);const limbs={leftArm:new THREE.Group(),rightArm:new THREE.Group(),leftLeg:new THREE.Group(),rightLeg:new THREE.Group()};for(const [key,x,y] of [['leftArm',-.39,1.31],['rightArm',.39,1.31],['leftLeg',-.17,.57],['rightLeg',.17,.57]]){limbs[key].position.set(x,y,0);root.add(limbs[key]);const arm=key.includes('Arm');part(new THREE.CapsuleGeometry(arm?.085:.105,arm?.35:.42,4,8),arm?suit:dark,[0,arm?-.21:-.22,0],limbs[key]);part(new THREE.SphereGeometry(arm?.09:.11,12,10),skin,[0,arm?-.42:-.46,arm?0:.02],limbs[key]);if(!arm)part(new THREE.BoxGeometry(.19,.11,.32),dark,[0,-.5,.08],limbs[key])}root.userData.limbs=limbs;root.userData.torso=torso;scene.add(root);return root}const robot=makeRobot();
let worldGroups=[];let navPath=[],navPathIndex=0,navReplanTimer=0,navGoalKey='';let verticalVelocity=0,groundHeight=0,wasGrounded=true,jumpCooldown=0,fallStartHeight=0,airborneTime=0,lastMove=new THREE.Vector3(1,0,0),decisionConfidence=0.82,locomotionMode='WALK',stuckTime=0;const PHYSICS={gravity:14,jumpVelocity:7,maxJumpRise:1.65,maxStep:0.48,maxSafeDrop:2.35,robotHeight:1.85,bodyRadius:0.34};function clearWorld(){for(const g of worldGroups)scene.remove(g);worldGroups=[];objects=[];navPath=[];navPathIndex=0;navReplanTimer=0;navGoalKey=''}
function setChallenge(d){if(!d||d.schema!=='project-human-challenge'||!Array.isArray(d.objects))throw Error('This is not a valid PROJECT HUMAN challenge JSON.');challenge=d;clearWorld();const sp=d.start?.position||d.human?.position||[-7,0,0],gp=d.goal?.position||[7,0,0];startMarker.position.set(sp[0]||0,0,sp[2]||0);goalMarker.position.set(gp[0]||0,0,gp[2]||0);for(const data of d.objects){
const p=data.position||[0,0,0],s=data.scale||[1,1,1],r=data.rotation||[0,0,0];
const baseSizes={block:[2,2,2],platform:[5,.5,4],ramp:[4,.45,3],wall:[1,4,5],megaWall:[1,7,12],stairs:[3.2,2.72,5.76],bridge:[7,.35,2],moving:[2,1,2],marker:[1,1,1],arch:[4,4,1],tunnel:[5,3,3],pillar:[1,4,1],pipe:[4,.55,.55],crate:[2,2,2],hazard:[3,.8,1],seesaw:[5,.25,1],spring:[2,.6,2]};
const base=baseSizes[data.kind]||[2,2,2],w=Math.max(.15,base[0]*(s[0]||1)),h=Math.max(.15,base[1]*(s[1]||1)),dep=Math.max(.15,base[2]*(s[2]||1));
const mat=new THREE.MeshStandardMaterial({color:data.color||'#4f82b8',roughness:.7,metalness:.12});
const root=new THREE.Group();root.position.set(...p);root.rotation.set(...r);root.userData={kind:data.kind||'obstacle',name:data.name||data.kind||'Obstacle'};scene.add(root);worldGroups.push(root);
const parts=[];
function addBox(x,y,z,sx,sy,sz){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.04,sx),Math.max(.04,sy),Math.max(.04,sz)),mat);
 mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={kind:data.kind||'obstacle',name:data.name||data.kind||'Obstacle'};root.add(mesh);parts.push(mesh);
}
if(data.kind==='stairs'){
 const count=6,stepDepth=dep/count;
 for(let i=0;i<count;i++){
  const stepH=h*(i+1)/count;
  addBox(0,stepH/2,-dep/2+stepDepth*(i+.5),w,stepH,stepDepth+.025);
 }
}else if(data.kind==='tunnel'){
 const wallT=Math.min(w*.18,Math.max(.18,w*.09)),roofT=Math.min(h*.2,Math.max(.18,h*.12));
 // Three separate slabs create a genuine open passage through the structure.
 addBox(-w/2+wallT/2,0,0,wallT,h,dep);
 addBox(w/2-wallT/2,0,0,wallT,h,dep);
 addBox(0,h/2-roofT/2,0,w,roofT,dep);
}else if(data.kind==='arch'){
 const legT=Math.min(w*.22,Math.max(.2,w*.12)),legH=h*.84,topT=Math.max(.2,h*.16);
 addBox(-w/2+legT/2,-h*.08,0,legT,legH,dep);
 addBox(w/2-legT/2,-h*.08,0,legT,legH,dep);
 addBox(0,h/2-topT/2,0,w,topT,dep);
}else if(data.kind==='ramp'){
 // A triangular-prism ramp: flat bottom, two triangular ends, and one sloping walkable face.
 const geo=new THREE.BufferGeometry();
 const v=[
  -w/2,-h/2,-dep/2,  w/2,-h/2,-dep/2,
  -w/2,-h/2, dep/2,  w/2,-h/2, dep/2,
  -w/2, h/2, dep/2,  w/2, h/2, dep/2
 ];
 geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
 geo.setIndex([
  0,2,1, 1,2,3,       // bottom
  0,1,5, 0,5,4,        // sloped top
  0,4,2, 1,3,5,        // triangular ends
  2,4,5, 2,5,3          // sides
 ]);
 geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={kind:data.kind,name:data.name||'Ramp'};root.add(mesh);parts.push(mesh);
}else{
 addBox(0,0,0,w,h,dep);
}
for(const mesh of parts){
 const bounds=new THREE.Box3().setFromObject(mesh),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 objects.push({mesh,data,x:center.x,z:center.z,halfX:Math.max(.1,size.x/2),halfZ:Math.max(.1,size.z/2),radius:Math.max(.55,Math.max(size.x,size.z)*.55),height:size.y,minY:bounds.min.y,maxY:bounds.max.y,centerY:center.y,kind:data.kind||'block'});
}
}robot.position.set(sp[0]||0,0,sp[2]||0);robot.rotation.y=0;verticalVelocity=0;groundHeight=0;wasGrounded=true;jumpCooldown=0;airborneTime=0;locomotionMode='WALK';attemptActive=false;running=false;autoTraining=false;if(retryTimer){clearTimeout(retryTimer);retryTimer=null}attemptProgress=0;finished=false;attemptElapsed=0;collisionCount=0;stuckTime=0;brain.setChallenge({start:sp,goal:gp,obstacles:objects.map(o=>({x:o.x,z:o.z,halfX:o.halfX,halfZ:o.halfZ,height:o.height}))});camera.position.set((sp[0]+gp[0])/2+10,Math.max(10,Math.abs(sp[0]-gp[0])*.55),Math.max(12,Math.abs(sp[2]-gp[2])+12));controls.target.set((sp[0]+gp[0])/2,1,((sp[2]||0)+(gp[2]||0))/2);controls.update();$('worldTitle').textContent=d.title||'Untitled challenge';$('worldDescription').textContent=d.description||'Challenge imported from PROJECT HUMAN World Builder.';$('worldCaption').textContent=`${d.title||'Untitled world'} · ${d.objects.length} placed objects`;$('obstacleCount').textContent=String(d.objects.length);$('worldMessage').textContent='World loaded. The editor file is unchanged.';updateStats();}
function loadLatest(){try{const active=localStorage.getItem(ACTIVE_KEY);if(active){setChallenge(JSON.parse(active));return true}const saved=JSON.parse(localStorage.getItem(SAVED_KEY)||'[]');if(saved.length){setChallenge(saved[0]);$('worldMessage').textContent='Loaded most recently saved local editor world.';return true}throw Error('No editor world found in this browser. Open the World Builder, then click “Send to Humanoid AI”.')}catch(e){$('worldMessage').textContent=e.message;return false}}
function refreshSaved(){const select=$('savedWorlds');select.innerHTML='<option value="">Choose a saved world…</option>';let arr=[];try{arr=JSON.parse(localStorage.getItem(SAVED_KEY)||'[]')}catch{}for(const d of arr){const op=document.createElement('option');op.value=d.id;op.textContent=d.title||'Untitled challenge';select.append(op)}}
function robotReset(){const sp=challenge?.start?.position||challenge?.human?.position||[-7,0,0];navPath=[];navPathIndex=0;navReplanTimer=0;navGoalKey='';robot.position.set(sp[0]||0,0,sp[2]||0);robot.rotation.set(0,0,0);verticalVelocity=0;groundHeight=0;wasGrounded=true;jumpCooldown=0;airborneTime=0;locomotionMode='WALK';Object.values(robot.userData.limbs).forEach(l=>l.rotation.set(0,0,0));attemptProgress=0;attemptElapsed=0;attemptActive=false;finished=false;collisionCount=0;stuckTime=0;brain.beginEpisode();updateStats()}
function beginAttempt(){if(!challenge&&!loadLatest())return;robot.userData.torso.material.emissive=new THREE.Color('#000000');robot.userData.torso.material.emissiveIntensity=0;if(retryTimer){clearTimeout(retryTimer);retryTimer=null}robotReset();attemptActive=true;running=true;finished=false;lastTime=0;$('simStatus').textContent=autoTraining?'TRAINING · ATTEMPT '+(brain.getStats().attempts+1):'TRAINING';$('reasonText').textContent='Testing a strategy informed by previous attempts…'}
function complete(success,reason){if(finished)return;finished=true;attemptActive=false;running=false;attemptsThisSession++;if(success)successesThisSession++;else failuresThisSession++;brain.learn({success});$('simStatus').textContent=success?'SUCCESS':(autoTraining?'LEARNING · RETRYING':'ATTEMPT ENDED');$('reasonText').textContent=success?reason:(reason+' Previous experience is saved; the next attempt will adapt its choices.');updateStats();if(success){autoTraining=false;if(retryTimer){clearTimeout(retryTimer);retryTimer=null}}else if(autoTraining){retryTimer=setTimeout(()=>{retryTimer=null;if(autoTraining&&challenge)beginAttempt()},850)}}
function updateStats(){const s=brain.getStats();$('attempts').textContent=String(s.attempts);$('successRate').textContent=(s.attempts?Math.round(s.successes/s.attempts*100):0)+'%';$('policyLevel').textContent=String(s.policyLevel);$('progressText').textContent=Math.round(attemptProgress*100)+'%';$('progressBar').style.width=(attemptProgress*100)+'%';$('memorySuccess').textContent=String(s.successes);$('memoryFail').textContent=String(s.failures);$('memoryAvoid').textContent=s.avoidanceBias.toFixed(2)+'×';$('obstacleCount').textContent=String(challenge?.objects?.length??objects.length)}
function objectBounds(o){
 const b=new THREE.Box3().setFromObject(o.mesh);
 return {minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z};
}
function overlapXZ(x,z,o,pad=PHYSICS.bodyRadius){
 const b=objectBounds(o);return x>b.minX-pad&&x<b.maxX+pad&&z>b.minZ-pad&&z<b.maxZ+pad;
}
function surfaceAt(x,z,fromY,allowStep=true){
 let best=0,source=null;
 const standable=new Set(['platform','bridge','stairs','ramp','block','crate','spring','seesaw','moving','pipe','hazard']);
 for(const o of objects){
  if(!standable.has(o.kind)||!overlapXZ(x,z,o,0))continue;
  const b=objectBounds(o);let top=b.maxY;
  // On a ramp, estimate the sloped walking surface rather than its full bounding-box roof.
  if(o.kind==='ramp'){
   const local=new THREE.Vector3(x,0,z);o.mesh.parent?.worldToLocal(local);
   const parent=o.mesh.parent;
   const rootPos=parent?.position||new THREE.Vector3();
   const dep=Math.max(.1,(o.data.scale?.[2]||1)*3);
   const h=Math.max(.1,(o.data.scale?.[1]||1)*.45);
   top=rootPos.y-h/2+h*THREE.MathUtils.clamp((local.z+dep/2)/dep,0,1);
  }
  if(top<=fromY+PHYSICS.maxJumpRise+.15&&top>best){best=top;source=o;}
 }
 return {height:best,source};
}
function bodyBlocked(x,y,z,ignoreTop=false){
 const feet=y,head=y+PHYSICS.robotHeight;
 for(const o of objects){if(!overlapXZ(x,z,o,.27))continue;const b=objectBounds(o);
  // Stair treads and ramps are terrain. Only reject them when their next support
  // surface is beyond a safe step/jump; otherwise surfaceAt() handles elevation.
  if(o.kind==='stairs'||o.kind==='ramp'){
   const support=surfaceAt(x,z,feet,true),rise=support.height-feet;
   if(rise<=PHYSICS.maxStep+.09&&rise>=-.25)continue;
   if(rise>PHYSICS.maxStep+.09&&rise<=PHYSICS.maxJumpRise&&wasGrounded)continue;
   if(rise>PHYSICS.maxJumpRise) return o;
   continue;
  }
  // A roof is still solid when the robot's head reaches it; side walls only block when vertical volumes overlap.
  if(head>b.minY+.03&&feet<b.maxY-.025){
   if(b.maxY-feet<=PHYSICS.maxStep+.06)continue;
   if(ignoreTop&&Math.abs(feet-b.maxY)<.12)continue;
   return o;
  }
 }
 return null;
}
function findForwardObstacle(x,z,dir,reach=1.65){
 let nearest=null,dist=Infinity;
 for(const o of objects){
  const b=objectBounds(o),cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
  const dx=cx-x,dz=cz-z,along=dx*dir.x+dz*dir.z,lateral=Math.abs(dx*dir.z-dz*dir.x);
  const halfAlong=Math.abs(dir.x)*(b.maxX-b.minX)/2+Math.abs(dir.z)*(b.maxZ-b.minZ)/2;
  const halfSide=Math.abs(dir.z)*(b.maxX-b.minX)/2+Math.abs(dir.x)*(b.maxZ-b.minZ)/2;
  const gap=along-halfAlong-PHYSICS.bodyRadius;
  if(gap>-0.15&&gap<reach&&lateral<halfSide+PHYSICS.bodyRadius+.12&&gap<dist){nearest=o;dist=gap;}
 }
 return nearest?{object:nearest,distance:dist}:null;
}
// Grid-based route planning: prefer a real open corridor over repeatedly pushing into a wall.
// Stairs and ramps are passable terrain; tall walls and solid blocks remain blocked.
const NAV_CELL=.7;
function navCellBlocked(x,z){
  const clearance=PHYSICS.bodyRadius+.18;
  for(const o of objects){
    const b=objectBounds(o);
    if(x<b.minX-clearance||x>b.maxX+clearance||z<b.minZ-clearance||z>b.maxZ+clearance)continue;
    if(o.kind==='stairs'||o.kind==='ramp')continue;
    if(['platform','bridge','block','crate','spring','seesaw','moving','pipe','hazard'].includes(o.kind)&&b.maxY<=PHYSICS.maxStep+.08)continue;
    if(b.maxY>.45&&b.minY<PHYSICS.robotHeight+.25)return true;
  }
  return false;
}
function planRoute(start,goal){
  const all=[start,goal];for(const o of objects){const b=objectBounds(o);all.push({x:b.minX,z:b.minZ},{x:b.maxX,z:b.maxZ});}
  let minX=Math.min(...all.map(v=>v.x))-3.5,maxX=Math.max(...all.map(v=>v.x))+3.5,minZ=Math.min(...all.map(v=>v.z))-3.5,maxZ=Math.max(...all.map(v=>v.z))+3.5;
  const maxSpan=80;
  if(maxX-minX>maxSpan){const c=(start.x+goal.x)/2;minX=c-maxSpan/2;maxX=c+maxSpan/2;}
  if(maxZ-minZ>maxSpan){const c=(start.z+goal.z)/2;minZ=c-maxSpan/2;maxZ=c+maxSpan/2;}
  const cols=Math.max(3,Math.ceil((maxX-minX)/NAV_CELL)+1),rows=Math.max(3,Math.ceil((maxZ-minZ)/NAV_CELL)+1);
  const cell=(x,z)=>({ix:Math.max(0,Math.min(cols-1,Math.round((x-minX)/NAV_CELL))),iz:Math.max(0,Math.min(rows-1,Math.round((z-minZ)/NAV_CELL)))});
  const key=(ix,iz)=>iz*cols+ix,point=(ix,iz)=>({x:minX+ix*NAV_CELL,z:minZ+iz*NAV_CELL});
  const nearestFree=c=>{
    const origin=point(c.ix,c.iz);if(!navCellBlocked(origin.x,origin.z))return c;
    for(let r=1;r<Math.max(cols,rows);r++){let best=null,bestD=Infinity;
      for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
        if(Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;
        const ix=c.ix+dx,iz=c.iz+dz;if(ix<0||iz<0||ix>=cols||iz>=rows)continue;
        const p=point(ix,iz);if(navCellBlocked(p.x,p.z))continue;
        const d=Math.hypot(p.x-origin.x,p.z-origin.z);if(d<bestD){bestD=d;best={ix,iz};}
      }if(best)return best;
    }return null;
  };
  const a=nearestFree(cell(start.x,start.z)),b=nearestFree(cell(goal.x,goal.z));if(!a||!b)return [];
  const startId=key(a.ix,a.iz),goalId=key(b.ix,b.iz);if(startId===goalId)return [goal];
  const total=cols*rows,g=new Float64Array(total);g.fill(Infinity);const came=new Int32Array(total);came.fill(-1);
  const closed=new Uint8Array(total),f=new Float64Array(total);f.fill(Infinity);g[startId]=0;
  const heuristic=(ix,iz)=>{const dx=Math.abs(ix-b.ix),dz=Math.abs(iz-b.iz);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};
  const heap=[];
  function push(id,score){let i=heap.length;heap.push({id,score});while(i>0){const p=(i-1)>>1;if(heap[p].score<=score)break;heap[i]=heap[p];i=p;}heap[i]={id,score};}
  function pop(){const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let l=i*2+1,r=l+1,best=i;if(l<heap.length&&heap[l].score<heap[best].score)best=l;if(r<heap.length&&heap[r].score<heap[best].score)best=r;if(best===i)break;heap[i]=heap[best];i=best;}heap[i]=last;}return top;}
  f[startId]=heuristic(a.ix,a.iz);push(startId,f[startId]);let found=false,iterations=0;
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  while(heap.length&&iterations++<total*3){const cur=pop(),id=cur.id;if(closed[id])continue;if(id===goalId){found=true;break;}closed[id]=1;
    const ix=id%cols,iz=Math.floor(id/cols);
    for(const [dx,dz] of dirs){const nx=ix+dx,nz=iz+dz;if(nx<0||nz<0||nx>=cols||nz>=rows)continue;const nid=key(nx,nz);if(closed[nid])continue;
      const p=point(nx,nz);if(navCellBlocked(p.x,p.z))continue;
      if(dx&&dz){const p1=point(ix+dx,iz),p2=point(ix,iz+dz);if(navCellBlocked(p1.x,p1.z)||navCellBlocked(p2.x,p2.z))continue;}
      const ng=g[id]+(dx&&dz?Math.SQRT2:1);if(ng<g[nid]){came[nid]=id;g[nid]=ng;f[nid]=ng+heuristic(nx,nz);push(nid,f[nid]);}
    }
  }
  if(!found)return [];const ids=[];let cur=goalId;while(cur!==-1&&cur!==startId){ids.push(cur);cur=came[cur];}ids.reverse();
  const raw=ids.map(id=>point(id%cols,Math.floor(id/cols)));if(!raw.length)return [goal];
  function lineClear(a,b){const d=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(d/(NAV_CELL*.35)));for(let i=1;i<=steps;i++){const t=i/steps;if(navCellBlocked(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;}return true;}
  const smooth=[];let i=0,anchor=start;
  while(i<raw.length){let furthest=i;for(let j=i+1;j<raw.length;j++){if(lineClear(anchor,raw[j]))furthest=j;else break;}smooth.push(raw[furthest]);anchor=raw[furthest];i=furthest+1;}
  if(Math.hypot(anchor.x-goal.x,anchor.z-goal.z)>.4&&lineClear(anchor,goal))smooth.push(goal);return smooth;
}
function navigationTarget(pos,goal,dt){
  navReplanTimer-=dt;const goalKey=`${Math.round(goal.x*2)/2},${Math.round(goal.z*2)/2}`;
  if(navReplanTimer<=0||navGoalKey!==goalKey||!navPath.length){navPath=planRoute({x:pos.x,z:pos.z},{x:goal.x,z:goal.z});navPathIndex=0;navReplanTimer=.45;navGoalKey=goalKey;}
  while(navPathIndex<navPath.length-1&&Math.hypot(navPath[navPathIndex].x-pos.x,navPath[navPathIndex].z-pos.z)<.75)navPathIndex++;
  return navPath[navPathIndex]||null;
}
function triggerJump(reason){
 if(!wasGrounded||jumpCooldown>0)return false;
 verticalVelocity=PHYSICS.jumpVelocity;wasGrounded=false;airborneTime=0;jumpCooldown=.22;locomotionMode='JUMP';
 $('reasonText').textContent=reason;return true;
}
function fatalFall(drop){
 locomotionMode='FALL';robot.userData.torso.material.emissive=new THREE.Color('#ff263f');robot.userData.torso.material.emissiveIntensity=1.1;
 brain.learnFromStep(-2);complete(false,`FATAL FALL: dropped ${drop.toFixed(1)} units, beyond the safe landing limit. The robot records this as a dangerous route.`);
 setTimeout(()=>{if(robot.userData.torso?.material){robot.userData.torso.material.emissive=new THREE.Color('#000000');robot.userData.torso.material.emissiveIntensity=0;}},700);
}
function updateRobot(dt){
 if(!attemptActive||!challenge||!running)return;
 attemptElapsed+=dt;jumpCooldown=Math.max(0,jumpCooldown-dt);
 if(attemptElapsed>85){brain.learnFromStep(-2);complete(false,'Time limit reached. The robot will revise its route next attempt.');return;}
 const gp=challenge.goal?.position||[7,0,0],goal=new THREE.Vector3(gp[0]||0,0,gp[2]||0),pos=robot.position;
 const obstacles=objects.map(o=>({x:o.x,z:o.z,halfX:o.halfX,halfZ:o.halfZ,radius:o.radius,height:o.height,kind:o.kind}));
 const state=brain.observe(pos,goal,obstacles),action=brain.chooseAction(state,pos);
 if(action.type==='goal'&&Math.abs(pos.y-groundHeight)<.45){attemptProgress=1;complete(true,'Goal reached. The successful route and movement decisions have been reinforced.');return;}
 const waypoint=navigationTarget(pos,goal,dt);
 let dir;
 if(waypoint){
  const routeDX=waypoint.x-pos.x,routeDZ=waypoint.z-pos.z,routeLength=Math.hypot(routeDX,routeDZ);
  dir=routeLength>.001?new THREE.Vector3(routeDX/routeLength,0,routeDZ/routeLength):new THREE.Vector3(goal.x-pos.x,0,goal.z-pos.z).normalize();
 }else{
  const direct=new THREE.Vector3(goal.x-pos.x,0,goal.z-pos.z).normalize();
  const candidates=[0,.45,-.45,.85,-.85,1.25,-1.25,1.65,-1.65,2.2,-2.2,Math.PI];
  let bestDir=null,bestScore=Infinity;
  for(const a of candidates){
   const d=new THREE.Vector3(direct.x*Math.cos(a)-direct.z*Math.sin(a),0,direct.x*Math.sin(a)+direct.z*Math.cos(a)).normalize();
   let score=0;
   for(let step=.3;step<=2.2;step+=.25){if(bodyBlocked(pos.x+d.x*step,pos.y,pos.z+d.z*step,true)){score+=100+(2.2-step)*20;break;}}
   score+=Math.hypot(goal.x-(pos.x+d.x),goal.z-(pos.z+d.z))*.35+Math.abs(a)*.04;
   if(score<bestScore){bestScore=score;bestDir=d;}
  }
  dir=bestDir||direct;
  if(bestScore>80){$('reasonText').textContent='No safe route is currently visible. Pausing to re-plan instead of pushing into the obstacle.';navReplanTimer=0;return;}
 }
 // Follow the collision-checked corridor. The neural net learns preferences,
 // but cannot override a route already verified by geometric path planning.
 const move=dir.clone();
 const look=findForwardObstacle(pos.x,pos.z,move,1.15);const chosen=look?.object;
 const kind=chosen?.kind||'';const obstacleTop=chosen?objectBounds(chosen).maxY:0;
 let speed=locomotionMode==='JUMP'&&!wasGrounded?3.15:(action.type==='avoid'?2.05:2.45);let message=action.reason||'Moving toward the goal.';
 // A cautious, geometry-aware policy: step up small ledges, climb stairs/ramp, jump low obstacles, detour around tall walls.
 if(chosen&&navPath.length&&['wall','megaWall','pillar','arch','tunnel'].includes(kind)){
  navPath=[];navPathIndex=0;navReplanTimer=0;speed=1.4;message=`${kind} ahead: replanning around the barrier instead of repeatedly pushing into it.`;decisionConfidence=.97;
 }else if(chosen){
  const rise=obstacleTop-groundHeight;
  if(kind==='stairs'||kind==='ramp'){
   speed=1.45;message=kind==='stairs'?'Stairs detected: shortening stride and climbing one step at a time.':'Ramp detected: following the sloped surface at a controlled pace.';
   decisionConfidence=.91;
  }else if(rise>0.06&&rise<=PHYSICS.maxStep){
   speed=1.55;message=`Low ledge detected (${rise.toFixed(1)} units): stepping up carefully.`;decisionConfidence=.88;
  }else if(rise>PHYSICS.maxStep&&rise<=PHYSICS.maxJumpRise&&kind!=='wall'&&kind!=='megaWall'&&kind!=='tunnel'&&kind!=='arch'&&kind!=='pillar'){
   if(wasGrounded&&jumpCooldown<=0){triggerJump(`Jump decision: ${kind||'obstacle'} is ${rise.toFixed(1)} units high and within the estimated jump range.`);decisionConfidence=.86;}
   speed=2.25;
  }else if(kind==='platform'||kind==='bridge'||kind==='seesaw'){
   const targetTop=obstacleTop;
   if(targetTop-groundHeight>PHYSICS.maxStep&&targetTop-groundHeight<=PHYSICS.maxJumpRise&&wasGrounded&&jumpCooldown<=0){triggerJump(`${kind} detected: jumping onto the raised surface, then checking the landing height.`);decisionConfidence=.82;}
   else {speed=1.65;message=`${kind} detected: checking the top surface and landing height.`;decisionConfidence=.84;}
  }else if(rise>PHYSICS.maxJumpRise||kind==='wall'||kind==='megaWall'||kind==='tunnel'||kind==='arch'||kind==='pillar'){
   // Never jump blindly at a high wall or a tunnel roof; let the learned planner select a detour.
   const left= new THREE.Vector3(-move.z,0,move.x),right=new THREE.Vector3(move.z,0,-move.x);
   const lRisk=brain.pathRisk(pos,{x:left.x,z:left.z},obstacles),rRisk=brain.pathRisk(pos,{x:right.x,z:right.z},obstacles);
   const side=lRisk<=rRisk?left:right;move.copy(side);speed=1.8;message=`${kind||'tall obstacle'} is too high to clear safely: choosing a detour instead of a risky jump.`;decisionConfidence=.94;
  }
 }
 // Sample ahead before committing. If the direct step intersects a solid wall, rotate toward the safer side.
 let next=pos.clone().addScaledVector(move,speed*dt);let hit=bodyBlocked(next.x,pos.y,next.z,true);
 if(hit&&!wasGrounded){
  // While airborne, keep trying forward only if the robot's body has cleared the obstacle vertically.
  hit=bodyBlocked(next.x,pos.y,next.z,false);
 }
 if(hit){
  const blockedObject=hit;
  // Do not alternate left/right blindly when a planned route is blocked. Stop, invalidate
  // the route, and let A* search for another corridor on the next frame.
  if(navPath.length){
   navPath=[];navPathIndex=0;navReplanTimer=0;next=pos.clone();
   message=`Route blocked by ${blockedObject.data?.name||blockedObject.kind||'an obstacle'}; stopping briefly and calculating a new path.`;decisionConfidence=.97;
  }else{
   const left=new THREE.Vector3(-move.z,0,move.x),right=new THREE.Vector3(move.z,0,-move.x);
   const lRisk=brain.pathRisk(pos,{x:left.x,z:left.z},obstacles),rRisk=brain.pathRisk(pos,{x:right.x,z:right.z},obstacles);
   const detour=lRisk<=rRisk?left:right;next=pos.clone().addScaledVector(detour,Math.min(speed,1.8)*dt);hit=bodyBlocked(next.x,pos.y,next.z,true);
   message=`Obstacle sensed at body height. Rechecking clearance and moving toward the safer side.`;decisionConfidence=.9;
   if(hit){brain.recordCollision(action,hit);collisionCount++;if(collisionCount>=7){complete(false,'The route is blocked by an obstacle too tall or narrow to cross safely.');return;}next.x=pos.x;next.z=pos.z;}
  }
 }else collisionCount=Math.max(0,collisionCount-1);
 const oldX=pos.x,oldZ=pos.z,oldDist=Math.hypot(goal.x-pos.x,goal.z-pos.z);
 pos.x=next.x;pos.z=next.z;
 // Vertical physics and support-surface detection.
 const support=surfaceAt(pos.x,pos.z,Math.max(groundHeight,pos.y-.1));const targetGround=support.height;
 if(wasGrounded&&targetGround>groundHeight+.02){
  const rise=targetGround-groundHeight;
  if(rise<=PHYSICS.maxStep){groundHeight=targetGround;pos.y=groundHeight;}
  else if(rise<=PHYSICS.maxJumpRise&&jumpCooldown<=0){pos.x=oldX;pos.z=oldZ;triggerJump(`Raised landing detected (${rise.toFixed(1)} units): initiating a controlled jump.`);}
  else {pos.x=oldX;pos.z=oldZ;message='The landing surface is too high for a safe step; choosing another route.';}
 }
 if(!wasGrounded){airborneTime+=dt;verticalVelocity-=PHYSICS.gravity*dt;pos.y+=verticalVelocity*dt;
  if(verticalVelocity<=0&&pos.y<=targetGround+.04){const drop=groundHeight-targetGround;
   if(drop>PHYSICS.maxSafeDrop){fatalFall(drop);return;}
   pos.y=targetGround;groundHeight=targetGround;verticalVelocity=0;wasGrounded=true;airborneTime=0;locomotionMode='LAND';message=drop>.8?`Landed from a ${drop.toFixed(1)}-unit drop; checking stability.`:'Landing confirmed. Resuming walking.';
  }
 }else{
  // Follow gentle ramps and stair tops, but do not snap down across a dangerous gap.
  const drop=groundHeight-targetGround;
  if(targetGround<groundHeight-.08){
   if(drop>PHYSICS.maxSafeDrop){fatalFall(drop);return;}
   groundHeight=targetGround;pos.y=groundHeight;
  }else if(targetGround>=groundHeight-.08&&targetGround<=groundHeight+PHYSICS.maxStep){groundHeight=targetGround;pos.y=groundHeight;}
 }
 // Detect unsupported edges: fall naturally instead of magically remaining at the previous height.
 if(wasGrounded&&targetGround<groundHeight-.4){wasGrounded=false;fallStartHeight=groundHeight;verticalVelocity=0;airborneTime=0;locomotionMode='FALL';message='No supporting platform beneath the next step. Falling; estimating landing danger.';}
 if(wasGrounded&&locomotionMode!=='JUMP')locomotionMode='WALK';
 const newDist=Math.hypot(goal.x-pos.x,goal.z-pos.z);
 if(oldDist-newDist<.015)stuckTime+=dt;else stuckTime=Math.max(0,stuckTime-dt*2);
 if(stuckTime>1.15){navPath=[];navPathIndex=0;navReplanTimer=0;stuckTime=0;brain.learnFromStep(-.8);message='Progress stalled: penalizing the failed action and rebuilding the route around the obstacle.';decisionConfidence=.96;}
 brain.learnFromStep((oldDist-newDist)*.75-(action.type==='avoid'?.006:0));
 if(Math.hypot(pos.x-oldX,pos.z-oldZ)>.001){robot.rotation.y=Math.atan2(pos.x-oldX,pos.z-oldZ);lastMove.set(pos.x-oldX,0,pos.z-oldZ).normalize();}
 walkClock+=dt*(locomotionMode==='CLIMB'?5:locomotionMode==='JUMP'?4:8);const l=robot.userData.limbs;
 if(locomotionMode==='JUMP'){l.leftLeg.rotation.x=-.55;l.rightLeg.rotation.x=-.55;l.leftArm.rotation.x=-1.0;l.rightArm.rotation.x=-1.0;}
 else if(locomotionMode==='CLIMB'){l.leftLeg.rotation.x=Math.sin(walkClock)*.8;l.rightLeg.rotation.x=-Math.sin(walkClock)*.8;l.leftArm.rotation.x=-Math.sin(walkClock)*.65;l.rightArm.rotation.x=Math.sin(walkClock)*.65;}
 else {l.leftLeg.rotation.x=Math.sin(walkClock)*.55;l.rightLeg.rotation.x=-Math.sin(walkClock)*.55;l.leftArm.rotation.x=-Math.sin(walkClock)*.35;l.rightArm.rotation.x=Math.sin(walkClock)*.35;}
 attemptProgress=THREE.MathUtils.clamp(1-pos.distanceTo(goal)/Math.max(.1,startMarker.position.distanceTo(goal)),0,.99);
 $('reasonText').textContent=`${message} Confidence: ${Math.round(decisionConfidence*100)}% · Mode: ${locomotionMode}.`;
 updateStats();
}
function resize(){const w=$('viewport').clientWidth,h=$('viewport').clientHeight;camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();renderer.setSize(w,h,false)}window.addEventListener('resize',resize);const observer=new ResizeObserver(resize);observer.observe($('viewport'));resize();function animate(t){requestAnimationFrame(animate);const dt=Math.min(.05,lastTime?(t-lastTime)/1000:0);lastTime=t;updateRobot(dt);controls.update();renderer.render(scene,camera)}requestAnimationFrame(animate);
$('trainBtn').onclick=()=>{autoTraining=true;if(attemptActive){running=true;$('simStatus').textContent='TRAINING';return}beginAttempt()};$('pauseBtn').onclick=()=>{autoTraining=false;if(retryTimer){clearTimeout(retryTimer);retryTimer=null}if(attemptActive){running=false;$('simStatus').textContent='PAUSED';$('reasonText').textContent='Paused. Your learned experience is preserved; press Train to continue automatic attempts.'}};$('resetBtn').onclick=()=>{autoTraining=false;if(retryTimer){clearTimeout(retryTimer);retryTimer=null}running=false;robotReset();$('simStatus').textContent='READY';$('reasonText').textContent='Robot reset. The AI learning record was kept.'};$('retryBtn').onclick=()=>{autoTraining=true;beginAttempt()};$('loadLatest').onclick=()=>{if(loadLatest())refreshSaved()};$('loadSaved').onclick=()=>{const d=JSON.parse(localStorage.getItem(SAVED_KEY)||'[]').find(x=>x.id===$('savedWorlds').value);if(!d){$('worldMessage').textContent='Choose a saved world first.';return}try{setChallenge(d)}catch(e){$('worldMessage').textContent=e.message}};$('savedWorlds').onchange=()=>{};$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{setChallenge(JSON.parse(await f.text()))}catch(err){$('worldMessage').textContent=err.message}e.target.value=''};$('clearMemory').onclick=()=>{if(confirm('Clear the humanoid learning record stored in this browser?')){brain.clear();updateStats();$('reasonText').textContent=brain.lastReason}};
refreshSaved();if(!loadLatest()){$('worldCaption').textContent='No world connected yet';$('simStatus').textContent='WAITING';}updateStats();
