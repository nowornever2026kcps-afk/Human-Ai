const MEMORY_KEY='project-human-ai-brain-v1';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const footprint=o=>({halfX:Math.max(.25,Number(o.halfX??o.radius??1)),halfZ:Math.max(.25,Number(o.halfZ??o.radius??1))});

export class HumanoidBrain{
 constructor(){this.memory=this.read();this.policyLevel=1;this.avoidanceBias=1;this.routeSide=1;this.lastReason='Ready to observe the world.';this.updatePolicy();this.lastWaypoint=null;this.routePath=null;this.routeIndex=1;this.routeSignature=''}
 read(){try{return JSON.parse(localStorage.getItem(MEMORY_KEY))||{attempts:0,successes:0,failures:0,sideScores:{left:0,right:0},avoidanceBias:1}}catch{return {attempts:0,successes:0,failures:0,sideScores:{left:0,right:0},avoidanceBias:1}}}
 persist(){try{localStorage.setItem(MEMORY_KEY,JSON.stringify(this.memory))}catch{}}
 updatePolicy(){this.avoidanceBias=clamp(Number(this.memory.avoidanceBias)||1,.65,2.5);this.policyLevel=1+Math.floor((this.memory.successes+Math.min(this.memory.failures,12))/4)}
 observe(position,goal,obstacles){
  const dx=goal.x-position.x,dz=goal.z-position.z,distance=Math.hypot(dx,dz)||1;
  const forward={x:dx/distance,z:dz/distance};let risk=0,nearest=Infinity,nearestObstacle=null;
  for(const raw of obstacles){
   const o={...raw,...footprint(raw)},ox=o.x-position.x,oz=o.z-position.z;
   const along=ox*forward.x+oz*forward.z,lateral=Math.abs(ox*forward.z-oz*forward.x);
   const extent=Math.abs(forward.x)*o.halfX+Math.abs(forward.z)*o.halfZ;
   const sideExtent=Math.abs(forward.z)*o.halfX+Math.abs(forward.x)*o.halfZ;
   const gap=along-extent-.42,sideGap=lateral-sideExtent-.42;
   if(gap>-.7&&gap<6&&sideGap<1.15){risk+=1/(.3+Math.max(0,gap))*(sideGap<0?1.8:1);if(gap<nearest){nearest=gap;nearestObstacle=raw}}
  }
  return {distance,forward,risk,nearestDistance:nearest,nearestObstacle,clearance:risk===0?'clear':'blocked',obstacles};
 }
 pointBlocked(p,obstacles,clearance=.48){
  return obstacles.some(raw=>{const o=footprint(raw);return raw.height!==undefined&&raw.height<=.45?false:Math.abs(p.x-raw.x)<o.halfX+clearance&&Math.abs(p.z-raw.z)<o.halfZ+clearance});
 }
 segmentClear(a,b,obstacles,clearance=.48){
  const dx=b.x-a.x,dz=b.z-a.z;
  for(const raw of obstacles){
   if(raw.height!==undefined&&raw.height<=.45)continue;
   const o=footprint(raw),minX=raw.x-o.halfX-clearance,maxX=raw.x+o.halfX+clearance,minZ=raw.z-o.halfZ-clearance,maxZ=raw.z+o.halfZ+clearance;
   let t0=0,t1=1;
   const clip=(p,q)=>{if(Math.abs(p)<1e-9)return q>=0;const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r}else{if(r<t0)return false;if(r<t1)t1=r}return true};
   if(clip(-dx,a.x-minX)&&clip(dx,maxX-a.x)&&clip(-dz,a.z-minZ)&&clip(dz,maxZ-a.z)&&t0<=t1)return false;
  }
  return true;
 }
 planRoute(position,goal,obstacles){
  // Visibility graph: each rectangular obstacle contributes four clearance corners.
  // Shortest-path search naturally makes wider obstacles produce longer detours.
  const nodes=[{x:position.x,z:position.z,type:'start'},{x:goal.x,z:goal.z,type:'goal'}];
  const clearance=.62;
  for(const raw of obstacles){
   if(raw.height!==undefined&&raw.height<=.45)continue;
   const o=footprint(raw),hx=o.halfX+clearance,hz=o.halfZ+clearance;
   const corners=[[-hx,-hz],[-hx,hz],[hx,-hz],[hx,hz]];
   for(const [x,z] of corners){const p={x:raw.x+x,z:raw.z+z,type:'corner'};if(!this.pointBlocked(p,obstacles,.08))nodes.push(p)}
   if(nodes.length>260)break;
  }
  const n=nodes.length,dist=Array(n).fill(Infinity),prev=Array(n).fill(-1),used=Array(n).fill(false);dist[0]=0;
  // Dijkstra over line-of-sight edges; node count is intentionally bounded for browser performance.
  for(let iter=0;iter<n;iter++){
   let u=-1;for(let i=0;i<n;i++)if(!used[i]&&(u<0||dist[i]<dist[u]))u=i;
   if(u<0||!Number.isFinite(dist[u]))break;
   if(u===1)break;used[u]=true;
   for(let v=0;v<n;v++){if(v===u||used[v]||!this.segmentClear(nodes[u],nodes[v],obstacles,.46))continue;
    const nd=dist[u]+Math.hypot(nodes[v].x-nodes[u].x,nodes[v].z-nodes[u].z);
    if(nd<dist[v]){dist[v]=nd;prev[v]=u}
   }
  }
  if(!Number.isFinite(dist[1]))return null;
  const path=[];let at=1;while(at!==-1){path.push(nodes[at]);if(at===0)break;at=prev[at]}
  path.reverse();return path.length>=2?path:null;
 }
 resetRoute(){this.routePath=null;this.routeIndex=1;this.routeSignature='';this.lastWaypoint=null}
 routeKey(goal,obstacles){return JSON.stringify([Math.round(goal.x*10),Math.round(goal.z*10),obstacles.map(o=>[Math.round(o.x*10),Math.round(o.z*10),Math.round((o.halfX??o.radius??1)*10),Math.round((o.halfZ??o.radius??1)*10),Math.round((o.height??1)*10)])])}
 chooseAction(state,position){
  if(state.distance<.62)return {type:'goal',angle:0,reason:'Goal reached.'};
  const goal={x:position.x+state.forward.x*state.distance,z:position.z+state.forward.z*state.distance};
  const signature=this.routeKey(goal,state.obstacles);
  if(!this.routePath||this.routeSignature!==signature){
   this.routePath=this.planRoute(position,goal,state.obstacles);
   this.routeIndex=1;this.routeSignature=signature;
  }
  let target=goal;
  if(this.routePath&&this.routePath.length>1){
   while(this.routeIndex<this.routePath.length-1&&Math.hypot(this.routePath[this.routeIndex].x-position.x,this.routePath[this.routeIndex].z-position.z)<.22)this.routeIndex++;
   target=this.routePath[Math.min(this.routeIndex,this.routePath.length-1)];
  }else if(!this.routePath){
   let best=null;
   for(const angle of [0,.4,-.4,.75,-.75,1.1,-1.1,1.5,-1.5,2,-2]){
    const c=Math.cos(angle),s=Math.sin(angle),f=state.forward,dir={x:f.x*c-f.z*s,z:f.x*s+f.z*c};
    let risk=0;for(let d=.4;d<=3;d+=.25){const p={x:position.x+dir.x*d,z:position.z+dir.z*d};if(this.pointBlocked(p,state.obstacles,.42))risk+=(3.2-d)*3}
    const score=risk*10+(1-(dir.x*f.x+dir.z*f.z))*2+Math.abs(angle)*.1;
    if(!best||score<best.score)best={angle,score};
   }
   return {type:'avoid',angle:best?.angle||0,reason:'Route is constrained; testing the lowest-risk direction.'};
  }
  const wx=target.x-position.x,wz=target.z-position.z,mag=Math.hypot(wx,wz)||1;
  const desired={x:wx/mag,z:wz/mag},f=state.forward;
  const angle=Math.atan2(f.x*desired.z-f.z*desired.x,f.x*desired.x+f.z*desired.z);
  this.lastWaypoint={x:target.x,z:target.z};
  const isGoal=this.routePath?this.routeIndex>=this.routePath.length-1:true;
  if(!isGoal)return {type:'avoid',angle,waypoint:this.lastWaypoint,reason:`Obstacle detected. Following planned waypoint ${this.routeIndex} of ${this.routePath.length-1}; route length accounts for obstacle size.`};
  return {type:'walk',angle:0,waypoint:this.lastWaypoint,reason:'Detour complete; route ahead is clear, continuing toward the goal.'};
 }
 learn(result){this.memory.attempts++;if(result.success){this.memory.successes++;this.memory.avoidanceBias=clamp(this.avoidanceBias*.96,.65,2.5);this.lastReason='Success reinforced the route strategy.'}else{this.memory.failures++;this.memory.avoidanceBias=clamp(this.avoidanceBias*1.12,.65,2.5);this.routeSide*=-1;this.lastReason='Failure recorded; the next attempt will give obstacles more clearance.'}this.persist();this.updatePolicy()}
 clear(){this.memory={attempts:0,successes:0,failures:0,sideScores:{left:0,right:0},avoidanceBias:1};this.persist();this.routeSide=1;this.resetRoute();this.updatePolicy();this.lastReason='Learning record cleared.'}
 getStats(){return {...this.memory,avoidanceBias:this.avoidanceBias,policyLevel:this.policyLevel}}
}
