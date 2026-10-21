const MEMORY_KEY='project-human-ai-brain-v1';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const footprint=o=>({halfX:Math.max(.25,Number(o.halfX??o.radius??1)),halfZ:Math.max(.25,Number(o.halfZ??o.radius??1))});
export class HumanoidBrain{
 constructor(){this.memory=this.read();this.policyLevel=1;this.avoidanceBias=1;this.routeSide=1;this.lastReason='Ready to observe the world.';this.updatePolicy()}
 read(){try{return JSON.parse(localStorage.getItem(MEMORY_KEY))||{attempts:0,successes:0,failures:0,sideScores:{left:0,right:0},avoidanceBias:1}}catch{return {attempts:0,successes:0,failures:0,sideScores:{left:0,right:0},avoidanceBias:1}}}
 persist(){try{localStorage.setItem(MEMORY_KEY,JSON.stringify(this.memory))}catch{}}
 updatePolicy(){this.avoidanceBias=clamp(Number(this.memory.avoidanceBias)||1,.65,2.5);this.policyLevel=1+Math.floor((this.memory.successes+Math.min(this.memory.failures,12))/4)}
 observe(position,goal,obstacles){
  const dx=goal.x-position.x,dz=goal.z-position.z,distance=Math.hypot(dx,dz)||1,forward={x:dx/distance,z:dz/distance};let risk=0,nearest=Infinity,nearestObstacle=null,sideRisk=0;
  for(const raw of obstacles){const o={...raw,...footprint(raw)},ox=o.x-position.x,oz=o.z-position.z,along=ox*forward.x+oz*forward.z,lateral=ox*forward.z-oz*forward.x;const longExtent=Math.abs(forward.x)*o.halfX+Math.abs(forward.z)*o.halfZ,latExtent=Math.abs(forward.z)*o.halfX+Math.abs(forward.x)*o.halfZ;const frontGap=along-longExtent-.4,sideGap=Math.abs(lateral)-latExtent-.42;
   if(frontGap>-.6&&frontGap<5.2&&sideGap<1.1){const danger=1/(.3+Math.max(0,frontGap));risk+=danger*(sideGap<0?1.8:1);sideRisk+=Math.sign(lateral||this.routeSide)*danger;if(frontGap<nearest){nearest=frontGap;nearestObstacle=raw}}
  }
  return {distance,forward,risk,sideRisk,nearestDistance:nearest,nearestObstacle,clearance:risk===0?'clear':'blocked',obstacles};
 }
 pathRisk(position,dir,obstacles){let score=0;for(let d=.35;d<=3.4;d+=.25){const x=position.x+dir.x*d,z=position.z+dir.z*d;for(const raw of obstacles){const o=footprint(raw);if(Math.abs(x-raw.x)<o.halfX+.42&&Math.abs(z-raw.z)<o.halfZ+.42){score+=((3.4-d)+1)*2;break}}}return score}
 chooseAction(state,position){
  if(state.distance<.62)return {type:'goal',angle:0,reason:'Goal reached.'};
  const f=state.forward,angles=[0,.38,-.38,.68,-.68,.98,-.98,1.25,-1.25];let best=null;
  for(const angle of angles){const c=Math.cos(angle),s=Math.sin(angle),dir={x:f.x*c-f.z*s,z:f.x*s+f.z*c},collision=this.pathRisk(position,dir,state.obstacles),progress=dir.x*f.x+dir.z*f.z,score=collision*10+(1-progress)*2.1+Math.abs(angle)*.16;if(!best||score<best.score)best={angle,score,collision}}
  if(best.collision<.1&&Math.abs(best.angle)<.05)return {type:'walk',angle:0,reason:state.clearance==='blocked'?'Obstacle sensed nearby; forward path checked clear.':'Front sensors clear; walking toward the goal.'};
  return {type:'avoid',angle:best.angle,side:Math.sign(best.angle)||this.routeSide,reason:best.collision<.1?'Front obstacle detected; selecting a clear side route.':'Obstacle detected; choosing the route with the lowest predicted collision risk.'};
 }
 learn(result){this.memory.attempts++;if(result.success){this.memory.successes++;this.memory.avoidanceBias=clamp(this.avoidanceBias*.96,.65,2.5);this.lastReason='Success reinforced the route strategy.'}else{this.memory.failures++;this.memory.avoidanceBias=clamp(this.avoidanceBias*1.12,.65,2.5);this.routeSide*=-1;this.lastReason='Failure recorded; the next attempt will give obstacles more clearance.'}this.persist();this.updatePolicy()}
 clear(){this.memory={attempts:0,successes:0,failures:0,sideScores:{left:0,right:0},avoidanceBias:1};this.persist();this.routeSide=1;this.updatePolicy();this.lastReason='Learning record cleared.'}
 getStats(){return {...this.memory,avoidanceBias:this.avoidanceBias,policyLevel:this.policyLevel}}
}
