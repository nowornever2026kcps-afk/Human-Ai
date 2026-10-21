const MEMORY_KEY='project-human-ai-brain-v1';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export class HumanoidBrain{
 constructor(){this.memory=this.read();this.policyLevel=1;this.avoidanceBias=1;this.routeSide=1;this.lastReason='Ready to observe the world.';this.updatePolicy()}
 read(){try{return JSON.parse(localStorage.getItem(MEMORY_KEY))||{attempts:0,successes:0,failures:0,sideScores:{left:0,right:0},avoidanceBias:1}}catch{return {attempts:0,successes:0,failures:0,sideScores:{left:0,right:0},avoidanceBias:1}}}
 persist(){try{localStorage.setItem(MEMORY_KEY,JSON.stringify(this.memory))}catch{} }
 updatePolicy(){this.avoidanceBias=clamp(Number(this.memory.avoidanceBias)||1,.65,2.5);this.policyLevel=1+Math.floor((this.memory.successes+Math.min(this.memory.failures,12))/4)}
 observe(position,goal,obstacles){const dx=goal.x-position.x,dz=goal.z-position.z;const distance=Math.hypot(dx,dz)||1;const forward={x:dx/distance,z:dz/distance};let risk=0,sideRisk=0;for(const o of obstacles){const ox=o.x-position.x,oz=o.z-position.z;const along=ox*forward.x+oz*forward.z;const lateral=Math.abs(ox*forward.z-oz*forward.x);if(along>-.2&&along<4.5&&lateral<o.radius+0.9){const danger=1/(.35+Math.max(0,along));risk+=danger;sideRisk+=(ox*forward.z-oz*forward.x)*danger}}return {distance,forward,risk,sideRisk,clearance:risk===0?'clear':'blocked',obstacles}}
 chooseAction(state){if(state.distance<.55)return {type:'goal',reason:'Goal reached.'};let side=this.routeSide;if(state.risk>0.025){if(Math.abs(state.sideRisk)>.01)side=state.sideRisk>0?-1:1;else side=this.routeSide;this.routeSide=side;return {type:'avoid',side,reason:'Obstacle detected; choosing a wider route.'}}return {type:'walk',side,reason:'Route looks clear; moving toward the goal.'}}
 learn(result){this.memory.attempts++;if(result.success){this.memory.successes++;this.memory.avoidanceBias=clamp(this.avoidanceBias*.96,.65,2.5);this.lastReason='Success reinforced the route strategy.'}else{this.memory.failures++;this.memory.avoidanceBias=clamp(this.avoidanceBias*1.12,.65,2.5);this.routeSide*=-1;this.lastReason='Failure recorded; the next attempt will give obstacles more clearance.'}this.persist();this.updatePolicy()}
 clear(){this.memory={attempts:0,successes:0,failures:0,sideScores:{left:0,right:0},avoidanceBias:1};this.persist();this.routeSide=1;this.updatePolicy();this.lastReason='Learning record cleared.'}
 getStats(){return {...this.memory,avoidanceBias:this.avoidanceBias,policyLevel:this.policyLevel}}
}
