'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 1280, H = 720;
const GROUND_Y   = H - 140;
const PLAYER_X   = 160;
const GRAVITY    = 900;
const JUMP_VEL   = -480;
const DJUMP_VEL  = -440;
const BASE_SPEED = 280;
const MAX_SPEED  = 680;
const SPEED_RAMP = 14;

// ── Utility ───────────────────────────────────────────────────────────────────
const rand    = (lo, hi) => Math.random() * (hi - lo) + lo;
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp    = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - (1 - t) * (1 - t);
function hexAdj(hex, amt) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = clamp(((n >> 16) & 0xff) + amt, 0, 255);
  const g = clamp(((n >>  8) & 0xff) + amt, 0, 255);
  const b = clamp(( n        & 0xff) + amt, 0, 255);
  return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('');
}

// ── Particle ──────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, { vx=0, vy=-60, life=1, size=5, color='#fff', gravity=120, star=false }={}) {
    this.x=x; this.y=y; this.vx=vx+rand(-12,12); this.vy=vy+rand(-12,12);
    this.life=this.maxLife=life; this.size=size; this.color=color; this.gravity=gravity; this.star=star;
  }
  update(dt) { this.x+=this.vx*dt; this.y+=this.vy*dt; this.vy+=this.gravity*dt; this.life-=dt; return this.life>0; }
  draw(ctx) {
    const t=this.life/this.maxLife; ctx.save(); ctx.globalAlpha=t; ctx.fillStyle=this.color;
    if(this.star){
      ctx.beginPath();
      for(let i=0;i<10;i++){const a=(i*Math.PI)/5-Math.PI/2,r=i%2===0?this.size*t:this.size*t*0.4;i===0?ctx.moveTo(this.x+Math.cos(a)*r,this.y+Math.sin(a)*r):ctx.lineTo(this.x+Math.cos(a)*r,this.y+Math.sin(a)*r);}
      ctx.closePath(); ctx.fill();
    } else { ctx.beginPath(); ctx.arc(this.x,this.y,this.size*t,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }
}

// ── Background ────────────────────────────────────────────────────────────────
class BackgroundSystem {
  constructor() {
    this.offsets=[0,0,0,0]; this.speeds=[0.08,0.22,0.50,0.85]; this.t=0;
    this.bubbles=Array.from({length:30},()=>({x:rand(0,W),y:rand(0,H),vy:rand(-18,-60),size:rand(2,8),alpha:rand(0.15,0.5)}));
    this.caustics=Array.from({length:22},()=>({x:rand(0,W),y:rand(GROUND_Y-30,GROUND_Y+10),r:rand(8,28),alpha:0,phase:rand(0,Math.PI*2)}));
    // Background creatures pool
    const fishColors=['#FF9F00','#FF6B9D','#00CED1','#FF6347','#B0FF30','#FFA500'];
    this.creatures=[
      {type:'shark',  x:W*0.85, y:130, vx:-72, size:90,  alpha:0.40},
      {type:'shark',  x:W*1.55, y:240, vx:-58, size:78,  alpha:0.35},
      {type:'dolphin',x:W*0.40, y:110, vx:-92, size:68,  alpha:0.50},
      {type:'dolphin',x:W*1.15, y:185, vx:-80, size:74,  alpha:0.45},
      {type:'turtle', x:W*0.60, y:280, vx:-26, size:54,  alpha:0.55},
      {type:'turtle', x:W*1.30, y:330, vx:-22, size:46,  alpha:0.55},
      {type:'turtle', x:W*0.12, y:370, vx:-30, size:50,  alpha:0.50},
      {type:'fish',   x:W*0.22, y:210, vx:-50, size:36,  alpha:0.60, color:fishColors[0]},
      {type:'fish',   x:W*0.75, y:310, vx:-44, size:32,  alpha:0.55, color:fishColors[2]},
      {type:'fish',   x:W*1.20, y:160, vx:-58, size:38,  alpha:0.60, color:fishColors[3]},
      {type:'fish',   x:W*0.50, y:400, vx:-36, size:30,  alpha:0.55, color:fishColors[4]},
    ];
  }
  _freshY(type) {
    if(type==='shark')   return rand(80,280);
    if(type==='dolphin') return rand(60,220);
    if(type==='turtle')  return rand(200,420);
    return rand(100,420);
  }
  update(dt,speed) {
    this.t+=dt;
    for(let i=0;i<4;i++) this.offsets[i]=(this.offsets[i]+speed*this.speeds[i]*dt)%W;
    for(const b of this.bubbles){b.y+=b.vy*dt;if(b.y<-12){b.y=H+12;b.x=rand(0,W);}}
    for(const c of this.caustics){c.x-=speed*0.06*dt;if(c.x<-40)c.x=W+40;c.alpha=0.12+0.10*Math.sin(this.t*2.2+c.phase);}
    for(const c of this.creatures){c.x+=c.vx*dt;if(c.x<-160){c.x=W+160;c.y=this._freshY(c.type);}}
  }
  draw(ctx) { this._ocean(ctx); this._bgCreatures(ctx); this._midCoral(ctx); this._nearReef(ctx); this._seaweedLayer(ctx); this._ground(ctx); }

  _ocean(ctx) {
    // Bright tropical water gradient
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,   '#00C9E0');   // bright cyan at surface
    g.addColorStop(0.15,'#009DBF');
    g.addColorStop(0.45,'#0070A0');
    g.addColorStop(0.8, '#004E82');
    g.addColorStop(1,   '#003466');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    // Dappled caustic light shafts (more numerous, brighter)
    ctx.save();
    for(let i=0;i<9;i++){
      const x=((i*148-this.offsets[0]*0.35+W*3)%W)-30;
      const lg=ctx.createLinearGradient(x,0,x+60,H*0.55);
      lg.addColorStop(0,'rgba(220,255,255,0.18)');
      lg.addColorStop(0.5,'rgba(180,240,255,0.08)');
      lg.addColorStop(1,'rgba(180,240,255,0)');
      ctx.fillStyle=lg;
      ctx.beginPath(); ctx.moveTo(x-20,0); ctx.lineTo(x+80,H*0.55); ctx.lineTo(x+40,H*0.55); ctx.lineTo(x-60,0); ctx.fill();
    }
    ctx.restore();

    // Bubbles
    ctx.save(); ctx.strokeStyle='rgba(180,240,255,0.75)'; ctx.lineWidth=1.2;
    for(const b of this.bubbles){ctx.globalAlpha=b.alpha*(0.5+0.5*Math.sin(this.t*1.8+b.x));ctx.beginPath();ctx.arc(b.x,b.y,b.size,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }

  _midCoral(ctx) {
    const off=this.offsets[1]; ctx.save(); ctx.globalAlpha=0.50;
    for(let tile=-1;tile<=1;tile++){const tx=tile*W-off;
      this._staghorn(ctx,tx+80, GROUND_Y,54,'#FF6B9D');
      this._staghorn(ctx,tx+310,GROUND_Y,46,'#FF7043');
      this._staghorn(ctx,tx+550,GROUND_Y,60,'#E91E8C');
      this._brainCoral(ctx,tx+420,GROUND_Y,28,'#FF8C42');
      this._brainCoral(ctx,tx+900,GROUND_Y,24,'#E040A0');
      this._staghorn(ctx,tx+800,GROUND_Y,42,'#FF9800');
      this._staghorn(ctx,tx+1040,GROUND_Y,56,'#FF5252');
      this._staghorn(ctx,tx+1230,GROUND_Y,48,'#FF6B9D');
      this._seaFan(ctx,tx+195,GROUND_Y,'#FF69B4',62);
      this._seaFan(ctx,tx+670,GROUND_Y,'#CE93D8',72);
      this._seaFan(ctx,tx+1110,GROUND_Y,'#4DD0E1',58);
      this._rocks(ctx,tx+240,GROUND_Y);
      this._rocks(ctx,tx+740,GROUND_Y);
    }
    ctx.restore();
  }

  _nearReef(ctx) {
    const off=this.offsets[2]; ctx.save(); ctx.globalAlpha=0.92;
    for(let tile=-1;tile<=1;tile++){const tx=tile*W-off;
      this._staghorn(ctx,tx+50,  GROUND_Y,40,'#FF6B9D');
      this._staghorn(ctx,tx+290, GROUND_Y,34,'#FF4757');
      this._staghorn(ctx,tx+500, GROUND_Y,48,'#FF7043');
      this._staghorn(ctx,tx+740, GROUND_Y,36,'#FF9800');
      this._staghorn(ctx,tx+940, GROUND_Y,44,'#E91E8C');
      this._staghorn(ctx,tx+1160,GROUND_Y,38,'#FF5252');
      this._brainCoral(ctx,tx+160,GROUND_Y,22,'#FF6B35');
      this._brainCoral(ctx,tx+640,GROUND_Y,26,'#C2185B');
      this._tubeCoral(ctx,tx+380,GROUND_Y,'#00BCD4');
      this._tubeCoral(ctx,tx+860,GROUND_Y,'#AB47BC');
      this._tubeCoral(ctx,tx+1250,GROUND_Y,'#26C6DA');
      this._starfish(ctx,tx+220,GROUND_Y-2,16,'#FF7043');
      this._starfish(ctx,tx+580,GROUND_Y-2,13,'#FF5252');
      this._starfish(ctx,tx+1020,GROUND_Y-2,18,'#FF8A65');
      this._anemone(ctx,tx+450,GROUND_Y);
      this._anemone(ctx,tx+780,GROUND_Y);
    }
    ctx.restore();
  }

  _seaweedLayer(ctx) {
    const off=this.offsets[3]; ctx.save();
    for(let tile=-1;tile<=1;tile++){const tx=tile*W-off;
      this._seaweed(ctx,tx+70, GROUND_Y,110);
      this._seaweed(ctx,tx+290,GROUND_Y,85);
      this._seaweed(ctx,tx+530,GROUND_Y,105);
      this._seaweed(ctx,tx+800,GROUND_Y,95);
      this._seaweed(ctx,tx+1080,GROUND_Y,120);
      this._rocks(ctx,tx+140,GROUND_Y);
      this._rocks(ctx,tx+680,GROUND_Y);
      this._starfish(ctx,tx+340,GROUND_Y-2,14,'#E64A19');
      this._starfish(ctx,tx+970,GROUND_Y-2,11,'#FF7043');
    }
    ctx.restore();
  }

  _ground(ctx) {
    // Bright tropical sandy floor
    const g=ctx.createLinearGradient(0,GROUND_Y,0,H);
    g.addColorStop(0,'#F5E0B0');
    g.addColorStop(0.25,'#EDD090');
    g.addColorStop(1,'#C8A050');
    ctx.fillStyle=g; ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);

    // Caustic light patterns on sand
    ctx.save();
    for(const c of this.caustics){
      ctx.globalAlpha=c.alpha;
      const cg=ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,c.r);
      cg.addColorStop(0,'rgba(255,240,180,0.9)'); cg.addColorStop(1,'rgba(255,240,180,0)');
      ctx.fillStyle=cg; ctx.beginPath(); ctx.ellipse(c.x,c.y,c.r,c.r*0.45,0,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // Sand ripples
    ctx.save(); ctx.strokeStyle='rgba(180,140,60,0.35)'; ctx.lineWidth=1;
    const so=this.offsets[3]*0.3;
    for(let i=0;i<12;i++){
      const sx=((i*110+20-so+W*3)%W);
      ctx.beginPath(); ctx.moveTo(sx,GROUND_Y+12); ctx.bezierCurveTo(sx+20,GROUND_Y+8,sx+40,GROUND_Y+16,sx+60,GROUND_Y+10); ctx.stroke();
    }
    ctx.restore();
  }

  // ── Staghorn coral — emoji 🪸 style, arms only curve UPWARD ──────────────
  _staghorn(ctx, x, y, scale, color) {
    const s=scale/55;
    ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
    // Draw one curved arm as a thick bezier + bulbous tip
    const arm=(x1,y1,cx1,cy1,cx2,cy2,x2,y2,w)=>{
      ctx.strokeStyle=color; ctx.lineWidth=w*s;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.bezierCurveTo(cx1,cy1,cx2,cy2,x2,y2); ctx.stroke();
      ctx.fillStyle=hexAdj(color,38); ctx.beginPath(); ctx.arc(x2,y2,w*s*1.55,0,Math.PI*2); ctx.fill();
    };
    // Thick trunk growing straight up
    ctx.strokeStyle=hexAdj(color,-18); ctx.lineWidth=9*s;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-20*s); ctx.stroke();
    // Three main arms spread upward — all bezier control points keep y decreasing
    arm(x,y-20*s,  x-16*s,y-32*s,  x-28*s,y-46*s,  x-32*s,y-57*s,  6.5);   // left
    arm(x,y-20*s,  x-3*s, y-34*s,  x+1*s, y-50*s,  x-1*s, y-62*s,  6.0);   // center
    arm(x,y-18*s,  x+14*s,y-30*s,  x+24*s,y-44*s,  x+27*s,y-55*s,  6.5);   // right
    // Sub-branches — fork off the main arms halfway, still only go upward
    arm(x-18*s,y-42*s,  x-26*s,y-52*s,  x-32*s,y-58*s,  x-30*s,y-66*s,  3.8);
    arm(x+15*s,y-38*s,  x+22*s,y-48*s,  x+26*s,y-56*s,  x+22*s,y-65*s,  3.8);
    // Rooted base circle
    ctx.fillStyle=hexAdj(color,-28); ctx.beginPath(); ctx.arc(x,y,6*s,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── Brain coral — dome with sinuous grooves ────────────────────────────────
  _brainCoral(ctx, x, y, r, color) {
    ctx.save();
    // Dome
    const g=ctx.createRadialGradient(x-r*0.3,y-r*0.35,0,x,y,r);
    g.addColorStop(0,hexAdj(color,42)); g.addColorStop(0.65,color); g.addColorStop(1,hexAdj(color,-30));
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(x,y,r,-Math.PI,0); ctx.closePath(); ctx.fill();
    // Sinuous brain grooves
    ctx.strokeStyle=hexAdj(color,-45); ctx.lineWidth=1.4; ctx.globalAlpha=0.55;
    for(let i=-2;i<=2;i++){
      const ox=x+i*r*0.36;
      ctx.beginPath(); ctx.moveTo(ox-r*0.16,y);
      ctx.bezierCurveTo(ox+r*0.10,y-r*0.38, ox-r*0.10,y-r*0.68, ox,y-r*0.97); ctx.stroke();
    }
    ctx.globalAlpha=1;
    // Bottom shadow ridge
    ctx.fillStyle=hexAdj(color,-32);
    ctx.beginPath(); ctx.ellipse(x,y+2,r*0.88,4.5,0,0,Math.PI); ctx.fill();
    ctx.restore();
  }

  // ── Tube coral — cluster of upright hollow tubes with open tops ────────────
  _tubeCoral(ctx, x, y, color) {
    ctx.save();
    [[0,0,7,38],[-11,3,5.5,30],[10,2,6,34],[-5,5,4.5,24],[15,4,5,28]].forEach(([dx,dy,r,h])=>{
      const tx=x+dx, ty=y-dy;
      // Tube body
      const tg=ctx.createLinearGradient(tx-r,ty,tx+r,ty);
      tg.addColorStop(0,hexAdj(color,-25)); tg.addColorStop(0.35,hexAdj(color,20)); tg.addColorStop(1,hexAdj(color,-15));
      ctx.fillStyle=tg;
      ctx.beginPath(); ctx.roundRect(tx-r,ty-h,r*2,h,r*0.4); ctx.fill();
      // Open top ring (hollow interior)
      ctx.fillStyle=hexAdj(color,-50); ctx.beginPath(); ctx.ellipse(tx,ty-h,r,r*0.45,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=hexAdj(color,15); ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.ellipse(tx,ty-h,r,r*0.45,0,0,Math.PI*2); ctx.stroke();
    });
    ctx.restore();
  }

  // ── Sea fan — delicate lattice fan spreading upward ────────────────────────
  _seaFan(ctx, x, y, color, size) {
    ctx.save(); ctx.lineCap='round';
    // Main stalk
    ctx.strokeStyle=hexAdj(color,-20); ctx.lineWidth=2.8;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-size*0.3); ctx.stroke();
    // Fan ribs — spread upward only (angles -150° to -30°)
    for(let i=-4;i<=4;i++){
      const a=(-Math.PI/2)+(i/4)*0.72;
      const mx=x+Math.cos(a+0.12)*size*0.55, my=y+Math.sin(a+0.12)*size*0.55;
      const ex=x+Math.cos(a)*size, ey=y+Math.sin(a)*size;
      ctx.strokeStyle=color; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(x,y-size*0.28); ctx.quadraticCurveTo(mx,my,ex,ey); ctx.stroke();
    }
    // Cross-hatch lattice lines
    ctx.strokeStyle=hexAdj(color,15); ctx.lineWidth=0.8; ctx.globalAlpha=0.55;
    for(let d=0.3;d<=0.85;d+=0.22){
      ctx.beginPath();
      ctx.arc(x,y,size*d,-Math.PI+0.25,-0.25); ctx.stroke();
    }
    ctx.globalAlpha=1;
    ctx.restore();
  }

  // ── Starfish resting on the sand ──────────────────────────────────────────
  _starfish(ctx, x, y, size, color) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(0.28);
    const sg=ctx.createRadialGradient(-size*0.2,-size*0.2,0,0,0,size);
    sg.addColorStop(0,hexAdj(color,38)); sg.addColorStop(1,color);
    ctx.fillStyle=sg;
    ctx.beginPath();
    for(let i=0;i<10;i++){const a=(i*Math.PI/5)-Math.PI/2,r=i%2===0?size:size*0.40;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}
    ctx.closePath(); ctx.fill();
    // Bumpy texture dots along each arm
    ctx.fillStyle=hexAdj(color,-22); ctx.globalAlpha=0.55;
    for(let i=0;i<5;i++){const a=(i*2*Math.PI/5)-Math.PI/2;[[0.35],[0.65]].forEach(([t])=>{ctx.beginPath();ctx.arc(Math.cos(a)*size*t,Math.sin(a)*size*t,2.2,0,Math.PI*2);ctx.fill();});}
    // Center disc
    ctx.globalAlpha=1; ctx.fillStyle=hexAdj(color,-15);
    ctx.beginPath(); ctx.arc(0,0,size*0.22,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── Rock cluster ──────────────────────────────────────────────────────────
  _rocks(ctx, x, y) {
    ctx.save();
    [[0,0,19,14,0.15],[-22,4,14,10,-0.1],[20,5,13,9,0.2],[-8,8,9,7,0.05]].forEach(([rx,ry,rw,rh,rot])=>{
      ctx.save(); ctx.translate(x+rx,y+ry); ctx.rotate(rot);
      const rg=ctx.createRadialGradient(-rw*0.3,-rh*0.4,0,0,0,rw);
      rg.addColorStop(0,'#C0C8CC'); rg.addColorStop(0.6,'#8A9598'); rg.addColorStop(1,'#5A6568');
      ctx.fillStyle=rg; ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.ellipse(0,0,rw,rh,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  }

  _anemone(ctx,x,y) {
    const sway=Math.sin(this.t*1.4+x*0.01)*7;
    for(let i=-3;i<=3;i++){const hue=300+i*12;ctx.strokeStyle=`hsl(${hue},85%,55%)`;ctx.lineWidth=3.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+i*7+sway,y-18,x+i*9+sway,y-36);ctx.stroke();ctx.fillStyle=`hsl(${hue},85%,72%)`;ctx.beginPath();ctx.arc(x+i*9+sway,y-36,4.5,0,Math.PI*2);ctx.fill();}
  }

  _seaweed(ctx,x,y,h) {
    const sway=Math.sin(this.t*1.0+x*0.005)*10;
    ctx.strokeStyle='#26C485'; ctx.lineWidth=3.5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x,y); ctx.bezierCurveTo(x+sway,y-h*0.33,x-sway,y-h*0.66,x+sway*0.5,y-h); ctx.stroke();
    ctx.strokeStyle='#5EE8A0'; ctx.lineWidth=1.8;
    for(let i=1;i<=3;i++){const t=i/3,lx=x+sway*(t-0.5),ly=y-h*t;ctx.beginPath();ctx.ellipse(lx+10,ly,11,4.5,Math.PI/4,0,Math.PI*2);ctx.stroke();}
  }

  // ── Background creatures ────────────────────────────────────────────────────
  _bgCreatures(ctx) {
    for(const c of this.creatures){
      ctx.save(); ctx.globalAlpha=c.alpha; ctx.translate(c.x,c.y);
      if(c.type==='shark')        this._drawShark(ctx,c.size);
      else if(c.type==='dolphin') this._drawDolphin(ctx,c.size);
      else if(c.type==='turtle')  this._drawTurtle(ctx,c.size);
      else                        this._drawBgFish(ctx,c.size,c.color);
      ctx.restore();
    }
  }

  _drawShark(ctx,s) {
    const dark='#3A5060', mid='#4E6B80', belly='#C8DCE8';
    // Body (torpedo, counter-shaded)
    const bg=ctx.createLinearGradient(0,-s*0.16,0,s*0.16);
    bg.addColorStop(0,dark); bg.addColorStop(0.55,mid); bg.addColorStop(1,belly);
    ctx.fillStyle=bg; ctx.beginPath();
    ctx.moveTo(-s*0.50,0);
    ctx.bezierCurveTo(-s*0.42,-s*0.13,-s*0.08,-s*0.17, s*0.28,-s*0.10);
    ctx.bezierCurveTo( s*0.44,-s*0.05, s*0.50, 0,      s*0.50, 0);
    ctx.bezierCurveTo( s*0.44, s*0.05, s*0.28, s*0.10,-s*0.08, s*0.14);
    ctx.bezierCurveTo(-s*0.42, s*0.11,-s*0.50, s*0.04,-s*0.50, 0);
    ctx.closePath(); ctx.fill();
    // Dorsal fin
    ctx.fillStyle=dark; ctx.beginPath();
    ctx.moveTo(-s*0.05,-s*0.13); ctx.bezierCurveTo(-s*0.14,-s*0.40,-s*0.20,-s*0.42,-s*0.24,-s*0.38);
    ctx.lineTo(s*0.14,-s*0.13); ctx.closePath(); ctx.fill();
    // Caudal fin (crescent, at tail end = right)
    ctx.fillStyle=dark;
    ctx.beginPath(); ctx.moveTo(s*0.44,-s*0.02);
    ctx.bezierCurveTo(s*0.52,-s*0.08,s*0.60,-s*0.24,s*0.55,-s*0.30);
    ctx.bezierCurveTo(s*0.50,-s*0.28,s*0.44,-s*0.16,s*0.42,-s*0.04); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s*0.44,s*0.02);
    ctx.bezierCurveTo(s*0.52,s*0.08,s*0.60,s*0.24,s*0.55,s*0.30);
    ctx.bezierCurveTo(s*0.50,s*0.28,s*0.44,s*0.16,s*0.42,s*0.04); ctx.fill();
    // Pectoral fin (swept below body)
    ctx.fillStyle=mid; ctx.beginPath();
    ctx.moveTo(-s*0.02,s*0.10); ctx.bezierCurveTo(s*0.10,s*0.18,s*0.22,s*0.32,s*0.13,s*0.35);
    ctx.bezierCurveTo(s*0.04,s*0.30,-s*0.04,s*0.20,-s*0.02,s*0.10); ctx.fill();
    // Gill slits
    ctx.strokeStyle=dark; ctx.lineWidth=1.1;
    for(let i=0;i<4;i++){const gx=-s*0.30+i*s*0.065;ctx.beginPath();ctx.moveTo(gx,-s*0.09);ctx.quadraticCurveTo(gx+s*0.02,0,gx,s*0.09);ctx.stroke();}
    // Eye
    ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(-s*0.37,-s*0.04,s*0.042,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#0A0A12'; ctx.beginPath(); ctx.arc(-s*0.37,-s*0.04,s*0.024,0,Math.PI*2); ctx.fill();
  }

  _drawDolphin(ctx,s) {
    const dark='#3E6A80', body='#5B8FA8', light='#A8CCDC';
    const bg=ctx.createLinearGradient(0,-s*0.13,0,s*0.13);
    bg.addColorStop(0,dark); bg.addColorStop(0.45,body); bg.addColorStop(1,light);
    ctx.fillStyle=bg; ctx.beginPath();
    ctx.moveTo(-s*0.50,0);                                                      // beak tip
    ctx.bezierCurveTo(-s*0.40,-s*0.06,-s*0.26,-s*0.14,-s*0.08,-s*0.15);
    ctx.bezierCurveTo( s*0.12,-s*0.16, s*0.32,-s*0.12, s*0.46,-s*0.05);
    ctx.bezierCurveTo( s*0.50,-s*0.02, s*0.50, 0,      s*0.50, 0);
    ctx.bezierCurveTo( s*0.46, s*0.05, s*0.32, s*0.10, s*0.08, s*0.12);
    ctx.bezierCurveTo(-s*0.12, s*0.14,-s*0.28, s*0.11,-s*0.42, s*0.06);
    ctx.bezierCurveTo(-s*0.46, s*0.03,-s*0.50, s*0.01,-s*0.50, 0);
    ctx.closePath(); ctx.fill();
    // Light belly stripe
    ctx.fillStyle=light; ctx.globalAlpha*=0.55;
    ctx.beginPath(); ctx.moveTo(-s*0.34,s*0.01);
    ctx.bezierCurveTo(-s*0.10,s*0.10, s*0.14,s*0.10, s*0.34,s*0.06);
    ctx.bezierCurveTo( s*0.14,s*0.13,-s*0.10,s*0.13,-s*0.34,s*0.01); ctx.fill();
    ctx.globalAlpha/=0.55;
    // Dorsal fin
    ctx.fillStyle=dark; ctx.beginPath();
    ctx.moveTo(s*0.06,-s*0.13); ctx.bezierCurveTo(s*0.00,-s*0.38,-s*0.08,-s*0.40,-s*0.12,-s*0.36);
    ctx.bezierCurveTo(-s*0.06,-s*0.26,s*0.04,-s*0.18,s*0.20,-s*0.13); ctx.closePath(); ctx.fill();
    // Fluke – two horizontal lobes at tail
    ctx.fillStyle=dark;
    ctx.beginPath(); ctx.moveTo(s*0.44,0);
    ctx.bezierCurveTo(s*0.50,-s*0.04,s*0.58,-s*0.16,s*0.52,-s*0.23);
    ctx.bezierCurveTo(s*0.46,-s*0.25,s*0.40,-s*0.16,s*0.40,-s*0.04); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s*0.44,0);
    ctx.bezierCurveTo(s*0.50,s*0.04,s*0.58,s*0.16,s*0.52,s*0.23);
    ctx.bezierCurveTo(s*0.46,s*0.25,s*0.40,s*0.16,s*0.40,s*0.04); ctx.fill();
    // Smile
    ctx.strokeStyle=dark; ctx.lineWidth=1.2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-s*0.46,s*0.01); ctx.quadraticCurveTo(-s*0.40,s*0.06,-s*0.34,s*0.02); ctx.stroke();
    // Eye
    ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(-s*0.30,-s*0.04,s*0.042,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1A2A30'; ctx.beginPath(); ctx.arc(-s*0.30,-s*0.04,s*0.024,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-s*0.285,-s*0.055,s*0.012,0,Math.PI*2); ctx.fill();
  }

  _drawTurtle(ctx,s) {
    const shell1='#B0D078', shell2='#6A9440', shell3='#3D5A22', flipper='#5A7A38', head='#6A8840';
    // Flippers (behind shell)
    ctx.fillStyle=flipper;
    ctx.beginPath(); ctx.ellipse(-s*0.28,-s*0.26,s*0.24,s*0.08,-0.52,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-s*0.28, s*0.26,s*0.24,s*0.08, 0.52,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( s*0.18,-s*0.23,s*0.18,s*0.07,-0.32,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( s*0.18, s*0.23,s*0.18,s*0.07, 0.32,0,Math.PI*2); ctx.fill();
    // Shell
    const sg=ctx.createRadialGradient(-s*0.06,-s*0.12,0,0,0,s*0.40);
    sg.addColorStop(0,shell1); sg.addColorStop(0.5,shell2); sg.addColorStop(1,shell3);
    ctx.fillStyle=sg; ctx.beginPath(); ctx.ellipse(0,0,s*0.36,s*0.28,0,0,Math.PI*2); ctx.fill();
    // Scute pattern
    ctx.strokeStyle='rgba(0,0,0,0.22)'; ctx.lineWidth=1.3;
    [[-s*0.18,0],[0,0],[s*0.16,0]].forEach(([cx,cy])=>{ctx.beginPath();ctx.ellipse(cx,cy,s*0.13,s*0.18,0,-0.75,0.75);ctx.stroke();});
    ctx.beginPath(); ctx.ellipse(-s*0.10,-s*0.16,s*0.20,s*0.09, 0.28,-Math.PI,-0.15); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-s*0.10, s*0.16,s*0.20,s*0.09,-0.28,  0.15, Math.PI); ctx.stroke();
    // Head
    ctx.fillStyle=head; ctx.beginPath(); ctx.ellipse(-s*0.44,0,s*0.12,s*0.09,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(-s*0.50,-s*0.02,s*0.028,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1A2A10'; ctx.beginPath(); ctx.arc(-s*0.50,-s*0.02,s*0.015,0,Math.PI*2); ctx.fill();
  }

  _drawBgFish(ctx,s,color) {
    // Forked tail (behind body)
    ctx.fillStyle=hexAdj(color,-18);
    ctx.beginPath(); ctx.moveTo(s*0.28,0);
    ctx.bezierCurveTo(s*0.36,-s*0.04,s*0.50,-s*0.22,s*0.45,-s*0.28);
    ctx.bezierCurveTo(s*0.38,-s*0.28,s*0.32,-s*0.16,s*0.28,-s*0.04); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s*0.28,0);
    ctx.bezierCurveTo(s*0.36,s*0.04,s*0.50,s*0.22,s*0.45,s*0.28);
    ctx.bezierCurveTo(s*0.38,s*0.28,s*0.32,s*0.16,s*0.28,s*0.04); ctx.fill();
    // Body
    const bg=ctx.createRadialGradient(-s*0.06,-s*0.06,0,0,0,s*0.44);
    bg.addColorStop(0,hexAdj(color,42)); bg.addColorStop(1,color);
    ctx.fillStyle=bg; ctx.beginPath();
    ctx.moveTo(-s*0.42,0);
    ctx.bezierCurveTo(-s*0.34,-s*0.28,s*0.12,-s*0.32,s*0.28,-s*0.16);
    ctx.bezierCurveTo(s*0.38,-s*0.05,s*0.38,s*0.05,s*0.28,s*0.16);
    ctx.bezierCurveTo(s*0.12,s*0.32,-s*0.34,s*0.28,-s*0.42,0); ctx.closePath(); ctx.fill();
    // Dorsal fin
    ctx.fillStyle=hexAdj(color,18);
    ctx.beginPath(); ctx.moveTo(-s*0.10,-s*0.28);
    ctx.bezierCurveTo(s*0.00,-s*0.46,s*0.14,-s*0.46,s*0.20,-s*0.30);
    ctx.lineTo(s*0.08,-s*0.28); ctx.closePath(); ctx.fill();
    // Vertical body stripe
    ctx.fillStyle=hexAdj(color,-32);
    ctx.globalAlpha*=0.42;
    ctx.beginPath(); ctx.ellipse(s*0.02,0,s*0.06,s*0.27,0,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha/=0.42;
    // Eye
    ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(-s*0.28,-s*0.06,s*0.058,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(-s*0.27,-s*0.06,s*0.032,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-s*0.255,-s*0.078,s*0.013,0,Math.PI*2); ctx.fill();
  }
}

// ── Seahorse ──────────────────────────────────────────────────────────────────
const COLOR_SCHEMES=[
  {body:'#E8902A',spot:'#F5C878',fin:'#C96010',dark:'#8B4A10',name:'Golden'},
  {body:'#FF6B9D',spot:'#FFB3D9',fin:'#C0005A',dark:'#7A0038',name:'Pink'},
  {body:'#00CED1',spot:'#80FFFF',fin:'#007A8A',dark:'#004A55',name:'Teal'},
  {body:'#9B6BDE',spot:'#CCA8FF',fin:'#6030AA',dark:'#3A1870',name:'Purple'},
];

class Seahorse {
  constructor() {
    this.x=PLAYER_X; this.y=GROUND_Y-72; this.vy=0; this.onGround=true;
    this.doubleJumpReady=false; this.width=36; this.height=72; this.colorIdx=0;
    this.animT=0; this.finAngle=0; this.bobOffset=0; this.shimmy=0;
    this.coronetGlow=0; this.bubbleTimer=0; this.state='idle';
  }
  get sc() { return COLOR_SCHEMES[this.colorIdx]; }

  jump() { if(this.onGround){this.vy=JUMP_VEL;this.onGround=false;this.state='jump';return true;}return false; }
  doubleJump() { if(this.doubleJumpReady){this.vy=DJUMP_VEL;this.doubleJumpReady=false;this.onGround=false;this.state='doubleJump';this.coronetGlow=1;return true;}return false; }
  enableDoubleJump() { this.doubleJumpReady=true; }
  collect() { this.shimmy=0.45; }

  update(dt,applyPhysics=true) {
    this.animT+=dt; this.finAngle=Math.sin(this.animT*9)*0.32;
    if(this.shimmy>0) this.shimmy-=dt*2.5;
    if(this.coronetGlow>0) this.coronetGlow-=dt*1.4;
    if(!applyPhysics){this.bobOffset=Math.sin(this.animT*2)*3;return;}
    this.bubbleTimer+=dt;
    if(!this.onGround){this.vy+=GRAVITY*dt;this.y+=this.vy*dt;}
    const floor=GROUND_Y-this.height;
    if(this.y>=floor){this.y=floor;this.vy=0;this.onGround=true;}
    this.bobOffset=this.onGround?Math.sin(this.animT*2)*3:0;
    this.state=this.onGround?'swim':(this.state!=='doubleJump'?'jump':this.state);
  }

  draw(ctx) {
    const sc=this.sc;
    const ox=this.x+(this.shimmy>0?Math.sin(this.animT*22)*4:0);
    const oy=this.y+this.bobOffset+this.height;  // origin = body base (ground level)
    ctx.save();
    ctx.translate(ox,oy);
    const S=this.height/100;  // all seahorse coords in 100-unit nominal space
    ctx.scale(S,S);

    // Shadow
    if(this.onGround){ctx.save();ctx.globalAlpha=0.14;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(8,14,26,5,0,0,Math.PI*2);ctx.fill();ctx.restore();}

    this._drawDorsalFin(ctx,sc);
    this._drawTail(ctx,sc);
    this._drawBody(ctx,sc);
    this._drawPectoralFin(ctx,sc);
    this._drawHead(ctx,sc);
    this._drawCoronet(ctx,sc);
    this._drawEye(ctx,sc);

    // Coronet glow
    if(this.coronetGlow>0){
      ctx.save();ctx.globalAlpha=this.coronetGlow*0.8;ctx.shadowColor='#FFD700';ctx.shadowBlur=30;
      ctx.fillStyle='#FFD700';ctx.beginPath();ctx.arc(-2,-97,14,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    ctx.restore();
  }

  _drawDorsalFin(ctx,sc) {
    // Thin translucent fin along the back (spine side, negative x)
    ctx.save();
    const fa=this.finAngle*0.18;
    ctx.translate(-7,-40); ctx.rotate(fa);
    const fg=ctx.createLinearGradient(-22,0,2,0);
    fg.addColorStop(0,'rgba(255,255,255,0)'); fg.addColorStop(1,sc.fin);
    ctx.fillStyle=fg; ctx.strokeStyle=sc.fin; ctx.lineWidth=0.8; ctx.globalAlpha=0.75;
    ctx.beginPath();
    ctx.moveTo(0,-20); ctx.bezierCurveTo(-8,-18,-18,-8,-22,0); ctx.bezierCurveTo(-18,10,-8,18,0,20);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Fin rays
    ctx.strokeStyle=sc.fin; ctx.lineWidth=0.5; ctx.globalAlpha=0.45;
    for(let i=0;i<=4;i++){const t=i/4;ctx.beginPath();ctx.moveTo(0,-20+40*t);ctx.lineTo(-22*Math.sin(t*Math.PI*0.9),20*(t-0.5));ctx.stroke();}
    ctx.restore(); ctx.globalAlpha=1;
  }

  _drawTail(ctx,sc) {
    // 5-segment tail spiral. Clockwise: right, down, left, up, inward.
    // Anchor points: A0(2,0) A1(24,28) A2(10,52) A3(-8,34) A4(4,12) A5(14,38)
    ctx.lineCap='round'; ctx.lineJoin='round';
    const segs=[
      [13,  2,0,   2,14,  26,14,  24,28],
      [ 9, 24,28,  24,44, 20,52,  10,52],
      [ 6, 10,52,  -2,52,-12,46,  -8,34],
      [ 4, -8,34,  -8,22,  0,8,    4,12],
      [2.5, 4,12,   4,24, 18,28,  14,38],
    ];
    for(const [lw,x0,y0,cx1,cy1,cx2,cy2,x1,y1] of segs){
      ctx.strokeStyle=sc.body; ctx.lineWidth=lw;
      ctx.beginPath(); ctx.moveTo(x0,y0); ctx.bezierCurveTo(cx1,cy1,cx2,cy2,x1,y1); ctx.stroke();
    }
    // Tail ring marks
    ctx.strokeStyle='rgba(255,255,255,0.22)'; ctx.lineWidth=0.8;
    [[12,14,5],[16,30,4.5],[4,48,3.5]].forEach(([tx,ty,tr])=>{ctx.beginPath();ctx.arc(tx,ty,tr,0,Math.PI*1.4);ctx.stroke();});
    // Spots on tail
    ctx.fillStyle=sc.spot; ctx.globalAlpha=0.28;
    [[12,14],[16,30],[4,48]].forEach(([tx,ty])=>{ctx.beginPath();ctx.arc(tx,ty,3,0,Math.PI*2);ctx.fill();});
    ctx.globalAlpha=1;
  }

  _drawBody(ctx,sc) {
    ctx.lineJoin='round'; ctx.lineCap='round';
    // Gradient: lighter belly (right) to darker spine (left)
    const bg=ctx.createLinearGradient(-12,-35,20,-35);
    bg.addColorStop(0,sc.spot); bg.addColorStop(0.6,sc.body); bg.addColorStop(1,sc.dark||hexAdj(sc.body,-25));
    ctx.fillStyle=bg; ctx.strokeStyle=hexAdj(sc.body,-38); ctx.lineWidth=1.2;

    // Closed body silhouette — spine side (up), then belly side (down)
    ctx.beginPath();
    ctx.moveTo(-3,-3);                                       // tail base, spine
    ctx.bezierCurveTo(-4,-15,-7,-26,-6,-38);                 // lower spine, slight S
    ctx.bezierCurveTo(-6,-48,-5,-58,-4,-65);                 // mid-upper spine
    ctx.bezierCurveTo(-4,-69,-3,-72,-3,-74);                 // neck join, spine side
    ctx.bezierCurveTo(-2,-77,2,-78,4,-74);                   // across neck top
    ctx.bezierCurveTo(7,-70,10,-63,11,-55);                  // chest
    ctx.bezierCurveTo(15,-46,19,-38,18,-30);                 // belly bulge (widest ~x=18)
    ctx.bezierCurveTo(18,-22,14,-13,10,-6);                  // belly taper
    ctx.bezierCurveTo(7,-2,4,0,3,0);                         // tail base, belly
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Belly sheen
    ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=4; ctx.globalAlpha=0.9;
    ctx.beginPath(); ctx.moveTo(9,-68); ctx.bezierCurveTo(14,-58,17,-46,16,-34); ctx.bezierCurveTo(14,-22,10,-12,8,-6); ctx.stroke();
    ctx.globalAlpha=1;

    // Armor rings (bony segments — horizontal arcs across body)
    ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1;
    [[-3,0,6],[-4,-12,10],[-5,-24,13],[-6,-34,15],[-6,-44,15],[-5,-54,13],[-4,-63,10],[-3,-71,7]].forEach(([rx,ry,rr])=>{
      ctx.beginPath(); ctx.arc(rx,ry,rr,0.12,Math.PI-0.12); ctx.stroke();
    });
    // Lighter ring overlay
    ctx.strokeStyle='rgba(255,255,255,0.16)'; ctx.lineWidth=0.7;
    [[-3,-6,6],[-4,-18,10],[-5,-30,13],[-6,-40,15],[-6,-50,14],[-4,-60,11],[-3,-69,7]].forEach(([rx,ry,rr])=>{
      ctx.beginPath(); ctx.arc(rx,ry,rr,0.12,Math.PI-0.12); ctx.stroke();
    });

    // Color spots
    ctx.fillStyle=sc.spot; ctx.globalAlpha=0.30;
    [[12,-20],[-2,-40],[10,-58]].forEach(([sx,sy])=>{ctx.beginPath();ctx.arc(sx,sy,4.5,0,Math.PI*2);ctx.fill();});
    ctx.globalAlpha=1;

    // Dorsal spines (tiny spikes along the back edge)
    ctx.strokeStyle=sc.dark||hexAdj(sc.body,-30); ctx.lineWidth=1.2; ctx.lineCap='round';
    [[-5,-18,-15,-23],[-5.5,-30,-15,-36],[-6,-42,-16,-47],[-5.5,-52,-14,-57],[-4.5,-62,-12,-66]].forEach(([bx,by,tx,ty])=>{
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(tx,ty); ctx.stroke();
    });
  }

  _drawPectoralFin(ctx,sc) {
    ctx.save(); ctx.translate(7,-66); ctx.rotate(this.finAngle*0.6);
    ctx.fillStyle=sc.fin; ctx.globalAlpha=0.82; ctx.strokeStyle=hexAdj(sc.fin,-18); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(14,2,18,12,10,18); ctx.bezierCurveTo(4,14,0,8,0,0);
    ctx.fill(); ctx.stroke(); ctx.restore(); ctx.globalAlpha=1;
  }

  _drawHead(ctx,sc) {
    // Horse-like head with a VERY LONG snout
    const hg=ctx.createRadialGradient(4,-85,2,0,-85,20);
    hg.addColorStop(0,sc.spot); hg.addColorStop(1,sc.body);
    ctx.fillStyle=hg; ctx.strokeStyle=hexAdj(sc.body,-38); ctx.lineWidth=1.2; ctx.lineJoin='round';

    ctx.beginPath();
    ctx.moveTo(-3,-74);                                         // neck, spine side
    ctx.bezierCurveTo(-5,-77,-9,-82,-8,-86);                   // back of cranium
    ctx.bezierCurveTo(-9,-91,-5,-95,-2,-95);                   // crown
    ctx.bezierCurveTo(1,-96,5,-94,8,-92);                      // forehead
    // UPPER SNOUT EDGE — long, tapering right
    ctx.bezierCurveTo(14,-91,26,-89,36,-88);
    // ROUNDED SNOUT TIP (small arc)
    ctx.bezierCurveTo(38,-88,38,-83,36,-83);
    // LOWER SNOUT EDGE — returns left
    ctx.bezierCurveTo(26,-83,14,-84,8,-85);
    // CHIN — drops below snout
    ctx.bezierCurveTo(5,-83,3,-80,2,-77);
    // THROAT — back to neck
    ctx.bezierCurveTo(1,-75,0,-74,-3,-74);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Snout dorsal highlight
    ctx.strokeStyle='rgba(255,255,255,0.22)'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(8,-92); ctx.bezierCurveTo(18,-90,28,-89,36,-88); ctx.stroke();

    // Gill groove
    ctx.strokeStyle=hexAdj(sc.body,-20); ctx.lineWidth=1; ctx.globalAlpha=0.38;
    ctx.beginPath(); ctx.arc(-1,-85,6,-0.1,Math.PI*0.72); ctx.stroke();
    ctx.globalAlpha=1;
  }

  _drawCoronet(ctx,sc) {
    // Bony crown — 5 irregular spines
    const base=-95;
    ctx.fillStyle=hexAdj(sc.fin,-5); ctx.strokeStyle=hexAdj(sc.fin,-40); ctx.lineWidth=1;
    ctx.beginPath(); ctx.rect(-10,base,22,3.5); ctx.fill(); ctx.stroke();

    ctx.fillStyle=sc.fin; ctx.strokeStyle=hexAdj(sc.fin,-35); ctx.lineWidth=1; ctx.lineCap='round';
    const spines=[[-8,16,-0.26],[-4,19,-0.10],[0,16,0],[4,11,0.12],[8,8,0.22]];
    for(const[sx,sh,tilt] of spines){
      ctx.save(); ctx.translate(sx,base); ctx.rotate(tilt);
      ctx.beginPath(); ctx.moveTo(-2.5,0); ctx.lineTo(0,-sh); ctx.lineTo(2.5,0); ctx.closePath();
      ctx.fill(); ctx.stroke(); ctx.restore();
    }

    if(this.coronetGlow>0){
      ctx.save(); ctx.globalAlpha=this.coronetGlow*0.8; ctx.shadowColor='#FFD700'; ctx.shadowBlur=26; ctx.fillStyle='#FFD700';
      for(const[sx,sh,tilt] of spines){ctx.save();ctx.translate(sx,base);ctx.rotate(tilt);ctx.beginPath();ctx.moveTo(-2.5,0);ctx.lineTo(0,-sh);ctx.lineTo(2.5,0);ctx.closePath();ctx.fill();ctx.restore();}
      ctx.restore();
    }
  }

  _drawEye(ctx,sc) {
    const ex=5,ey=-85;
    // Socket ring
    ctx.fillStyle=hexAdj(sc.body,-22); ctx.beginPath(); ctx.arc(ex,ey,7.5,0,Math.PI*2); ctx.fill();
    // Sclera
    ctx.fillStyle='#FFF8E8'; ctx.beginPath(); ctx.arc(ex,ey,6,0,Math.PI*2); ctx.fill();
    // Iris
    ctx.fillStyle='#3D2000'; ctx.beginPath(); ctx.arc(ex+0.8,ey+0.4,4.2,0,Math.PI*2); ctx.fill();
    // Pupil
    ctx.fillStyle='#080005'; ctx.beginPath(); ctx.arc(ex+0.8,ey+0.6,2.4,0,Math.PI*2); ctx.fill();
    // Primary shine
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(ex+2.4,ey-1,1.6,0,Math.PI*2); ctx.fill();
    // Secondary shine
    ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(ex-0.8,ey+2,0.9,0,Math.PI*2); ctx.fill();
  }
}

// ── Sea Urchin ─────────────────────────────────────────────────────────────────
class Urchin {
  constructor(x) {
    this.x=x; this.size=rand(28,40); this.spines=randInt(10,15);
    this.color=['#9B59B6','#E74C3C','#FF6B9D','#E85000'][randInt(0,3)];
    this.pulsePhase=rand(0,Math.PI*2);
  }
  get hitbox() { return {x:this.x-this.size*0.7,y:GROUND_Y-this.size*1.85,w:this.size*1.4,h:this.size*1.85}; }
  update(dt,speed) { this.x-=speed*dt; }
  draw(ctx) {
    const cx=this.x, cy=GROUND_Y, r=this.size;
    const pulse=0.94+0.06*Math.sin(performance.now()*0.0025+this.pulsePhase);
    ctx.save(); ctx.translate(cx,cy);

    // Spines radiate upward only (angles -175° to -5°, i.e. upper hemisphere)
    ctx.strokeStyle=hexAdj(this.color,-10); ctx.lineWidth=1.8; ctx.lineCap='round';
    for(let i=0;i<this.spines;i++){
      const a=-Math.PI+((i+0.5)/this.spines)*Math.PI; // sweeps from left to right across top
      const sr=r*pulse;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*sr*0.58,Math.sin(a)*sr*0.58);
      ctx.lineTo(Math.cos(a)*sr*1.05,Math.sin(a)*sr*1.05);
      ctx.stroke();
      // Tiny tip dot
      ctx.fillStyle=hexAdj(this.color,45);
      ctx.beginPath(); ctx.arc(Math.cos(a)*sr*1.05,Math.sin(a)*sr*1.05,1.8,0,Math.PI*2); ctx.fill();
    }
    // A few shorter side spines just above equator
    [-0.22,0.22].forEach(offset=>{
      ctx.strokeStyle=hexAdj(this.color,-15); ctx.lineWidth=1.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(offset)*r*0.58,Math.sin(offset)*r*0.58);
      ctx.lineTo(Math.cos(offset)*r*0.98,Math.sin(offset)*r*0.98);
      ctx.stroke();
    });

    // Body dome — slightly flattened at base so it sits on the sand
    const bg=ctx.createRadialGradient(-r*0.28,-r*0.35,0,0,-r*0.1,r*0.75);
    bg.addColorStop(0,hexAdj(this.color,50)); bg.addColorStop(0.5,this.color); bg.addColorStop(1,hexAdj(this.color,-45));
    ctx.fillStyle=bg;
    ctx.beginPath();
    ctx.arc(0,-r*0.55,r*0.62,0,Math.PI*2);
    ctx.fill();

    // Subtle glow halo
    ctx.globalAlpha=(0.10+0.06*Math.sin(performance.now()*0.0025+this.pulsePhase));
    ctx.fillStyle=this.color;
    ctx.beginPath(); ctx.arc(0,-r*0.55,r*0.9,0,Math.PI*2); ctx.fill();

    ctx.restore();
  }
}

// ── Moray Eel ─────────────────────────────────────────────────────────────────
const EEL={HIDDEN:0,WARN:1,EMERGE:2,VISIBLE:3,RETREAT:4};
class Eel {
  constructor(x,onWarn) {
    this.x=x; this.state=EEL.HIDDEN; this.timer=0;
    this.topY=GROUND_Y-95; this.currentY=GROUND_Y+20;
    this.jawOpen=0; this.shakeX=0; this.onWarn=onWarn; this.warnBubbles=[]; this.bodyWave=0;
    this.baseColor='#3E6E22'; this.spotColor='#B8A030';
  }
  get hitbox() { if(this.state!==EEL.EMERGE&&this.state!==EEL.VISIBLE)return null; return {x:this.x-22,y:this.currentY,w:44,h:GROUND_Y-this.currentY}; }
  start() {
    this.state=EEL.WARN; this.timer=1.4; this.onWarn();
    for(let i=0;i<7;i++) this.warnBubbles.push({x:this.x+rand(-14,14),y:GROUND_Y,vy:rand(-50,-95),life:1,size:rand(3,7)});
  }
  update(dt,speed) {
    this.x-=speed*dt; this.bodyWave+=dt*3;
    for(const b of this.warnBubbles){b.x-=speed*dt;b.y+=b.vy*dt;b.life-=dt;}
    this.warnBubbles=this.warnBubbles.filter(b=>b.life>0);
    this.timer-=dt;
    switch(this.state){
      case EEL.WARN:this.shakeX=Math.sin(performance.now()*0.025)*4;if(this.timer<=0){this.state=EEL.EMERGE;this.timer=0.4;}break;
      case EEL.EMERGE:this.currentY=lerp(GROUND_Y+20,this.topY,easeOut(1-this.timer/0.4));this.jawOpen=0.5+0.5*Math.sin(performance.now()*0.014);if(this.timer<=0){this.state=EEL.VISIBLE;this.currentY=this.topY;this.timer=rand(2,3);}break;
      case EEL.VISIBLE:this.jawOpen=0.5+0.5*Math.sin(performance.now()*0.01);if(this.timer<=0){this.state=EEL.RETREAT;this.timer=0.4;}break;
      case EEL.RETREAT:this.currentY=lerp(this.topY,GROUND_Y+20,easeOut(1-this.timer/0.4));if(this.timer<=0)this.state=EEL.HIDDEN;break;
    }
  }
  draw(ctx) {
    if(this.state===EEL.HIDDEN) return;
    const cx=this.x+this.shakeX;
    if(this.state===EEL.WARN){
      ctx.save(); ctx.globalAlpha=0.5+0.2*Math.sin(performance.now()*0.01);
      ctx.fillStyle='#FFD700'; ctx.beginPath(); ctx.ellipse(cx,GROUND_Y-5,28,9,0,0,Math.PI*2); ctx.fill();
      this._bubbles(ctx); ctx.restore(); return;
    }
    this._bubbles(ctx);
    ctx.save(); ctx.beginPath(); ctx.rect(cx-55,0,110,GROUND_Y+2); ctx.clip();

    // Sinuous body with mottled moray pattern
    const bodyLen=GROUND_Y-this.currentY+20;
    const segs=16;
    for(let pass=0;pass<2;pass++){
      ctx.strokeStyle=pass===0?this.baseColor:this.spotColor;
      ctx.lineWidth=pass===0?30:9; ctx.lineCap='round'; ctx.globalAlpha=pass===0?1:0.50;
      ctx.beginPath();
      for(let i=0;i<=segs;i++){const t=i/segs;const bx=cx+Math.sin(this.bodyWave*0.55+t*Math.PI*1.6)*7*(1-t*0.4);ctx.lineTo(bx,this.currentY+bodyLen*t);}
      ctx.stroke();
    }
    ctx.globalAlpha=1;
    // Body spots/blotches
    ctx.fillStyle=this.spotColor; ctx.globalAlpha=0.55;
    for(let i=1;i<segs;i+=2){const t=i/segs;const bx=cx+Math.sin(this.bodyWave*0.55+t*Math.PI*1.6)*7*(1-t*0.4);ctx.beginPath();ctx.ellipse(bx,this.currentY+bodyLen*t,9,6,Math.sin(t*3),0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;

    // Head
    const hx=cx+Math.sin(this.bodyWave*0.55)*5,hy=this.currentY;
    ctx.fillStyle=this.baseColor; ctx.strokeStyle=hexAdj(this.baseColor,-30); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(hx-22,hy+8); ctx.bezierCurveTo(hx-26,hy-4,hx-24,hx-14<0?hy-18:hy-18,hx-12,hy-18); ctx.bezierCurveTo(hx-2,hy-22,hx+8,hy-20,hx+18,hy-14); ctx.bezierCurveTo(hx+26,hy-6,hx+24,hy+4,hx+18,hy+10); ctx.bezierCurveTo(hx+8,hy+14,hx-8,hy+14,hx-22,hy+8); ctx.fill(); ctx.stroke();
    // Head spots
    ctx.fillStyle=this.spotColor; ctx.globalAlpha=0.65;
    [[-8,-13],[2,-19],[12,-14],[-14,-4]].forEach(([dx,dy])=>{ctx.beginPath();ctx.ellipse(hx+dx,hy+dy,4.5,3,rand(-0.5,0.5),0,Math.PI*2);ctx.fill();});
    ctx.globalAlpha=1;
    // Eyes
    [[hx-10,hy-10],[hx+8,hy-10]].forEach(([ex,ey])=>{ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ex,ey,5.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#200000';ctx.beginPath();ctx.arc(ex+0.5,ey+0.5,3.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ex+1.5,ey-1,1.2,0,Math.PI*2);ctx.fill();});
    // Nostril tubes (characteristic moray feature)
    ctx.fillStyle='#1A0A00'; ctx.strokeStyle=hexAdj(this.baseColor,-20); ctx.lineWidth=1;
    [[hx-4,hy-17],[hx+6,hy-17]].forEach(([nx,ny])=>{ctx.beginPath();ctx.ellipse(nx,ny,3,4,0,0,Math.PI*2);ctx.fill();ctx.stroke();});
    // Jaw
    const jg=this.jawOpen*18;
    ctx.fillStyle='#4A0000'; ctx.beginPath(); ctx.moveTo(hx-20,hy+8); ctx.lineTo(hx+18,hy+10); ctx.lineTo(hx+18,hy+10+jg); ctx.lineTo(hx-20,hy+8+jg); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#FFFFF0'; ctx.strokeStyle='rgba(200,200,150,0.4)'; ctx.lineWidth=0.5;
    for(let i=-3;i<=3;i++){const tx=hx+i*6,ty=hy+8+2;ctx.beginPath();ctx.moveTo(tx-3,ty);ctx.lineTo(tx,ty+jg*0.65);ctx.lineTo(tx+3,ty);ctx.closePath();ctx.fill();ctx.stroke();}
    for(let i=-2;i<=3;i++){const tx=hx+i*6+3,ty=hy+8+jg-2;ctx.beginPath();ctx.moveTo(tx-2.5,ty);ctx.lineTo(tx,ty-jg*0.55);ctx.lineTo(tx+2.5,ty);ctx.closePath();ctx.fill();ctx.stroke();}
    ctx.restore();
  }
  _bubbles(ctx){ctx.save();ctx.strokeStyle='rgba(155,225,255,0.75)';ctx.lineWidth=1.2;for(const b of this.warnBubbles){ctx.globalAlpha=b.life*0.65;ctx.beginPath();ctx.arc(b.x,b.y,b.size,0,Math.PI*2);ctx.stroke();}ctx.restore();}
}

// ── Shell ──────────────────────────────────────────────────────────────────────
const SHELL_DATA=[
  {name:'scallop', pts:10, rarity:'common',    color:'#FFB3D9',glow:'#FF6B9D'},
  {name:'clam',    pts:10, rarity:'common',    color:'#FFF44F',glow:'#FFD700'},
  {name:'conch',   pts:25, rarity:'rare',      color:'#FF8C69',glow:'#FF4500'},
  {name:'nautilus',pts:25, rarity:'rare',      color:'#D8B4FE',glow:'#9370DB'},
  {name:'cowrie',  pts:100,rarity:'legendary', color:'#FFD700',glow:'#FFA500'},
  {name:'abalone', pts:100,rarity:'legendary', color:'#A8F0E0',glow:'#40E0D0'},
];
class Shell {
  constructor(x,y) {
    this.x=x;this.y=y;this.animT=0;this.done=false;this.flyProgress=0;
    this.flyFrom={x,y};this.flyTo={x:W-70,y:25};
    const r=Math.random(),d=r<0.05?SHELL_DATA[randInt(4,5)]:r<0.30?SHELL_DATA[randInt(2,3)]:SHELL_DATA[randInt(0,1)];
    Object.assign(this,d);
  }
  get hitbox(){return {x:this.x-16,y:this.y-16,w:32,h:32};}
  collect(tx,ty){this.flyFrom={x:this.x,y:this.y};this.flyTo={x:tx,y:ty};this.flyProgress=0.001;}
  update(dt,speed){
    this.animT+=dt;
    if(this.flyProgress>0){this.flyProgress+=dt*3;if(this.flyProgress>=1){this.done=true;return;}this.x=lerp(this.flyFrom.x,this.flyTo.x,easeOut(this.flyProgress));this.y=lerp(this.flyFrom.y,this.flyTo.y,easeOut(this.flyProgress));}
    else{this.x-=speed*dt;this.y+=Math.sin(this.animT*2)*0.6;}
  }
  draw(ctx){
    const flying=this.flyProgress>0,alpha=flying?1-this.flyProgress*0.8:1,scale=flying?lerp(1,0.35,this.flyProgress):1;
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(this.x,this.y);ctx.scale(scale,scale);
    ctx.rotate(this.animT*(this.rarity==='legendary'?1.4:0.4));
    if(this.rarity!=='common'){ctx.shadowColor=this.glow;ctx.shadowBlur=this.rarity==='legendary'?24:12;}
    this['_draw_'+this.name](ctx);ctx.restore();
  }
  _radGrad(ctx,r,color,glow){const g=ctx.createRadialGradient(-r*0.3,-r*0.35,0,0,0,r);g.addColorStop(0,hexAdj(color,45));g.addColorStop(0.55,color);g.addColorStop(1,hexAdj(color,-30));ctx.fillStyle=g;ctx.strokeStyle=hexAdj(glow,-15);ctx.lineWidth=1.5;return g;}
  _draw_scallop(ctx){
    this._radGrad(ctx,13,this.color,this.glow);
    ctx.beginPath();for(let i=0;i<=7;i++){const a=(i/7)*Math.PI,r=13+Math.sin(i*0.9)*2;ctx.lineTo(Math.cos(a-Math.PI/2)*r,Math.sin(a-Math.PI/2)*r-3);}ctx.lineTo(0,10);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1;for(let i=-3;i<=3;i++){const a=(i/3)*0.65;ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(Math.sin(a)*14,-Math.cos(a)*14-3);ctx.stroke();}
    ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=2.5;ctx.beginPath();for(let i=0;i<=7;i++){const a=(i/7)*Math.PI,r=13+Math.sin(i*0.9)*2;ctx.lineTo(Math.cos(a-Math.PI/2)*r,Math.sin(a-Math.PI/2)*r-3);}ctx.stroke();
  }
  _draw_clam(ctx){
    this._radGrad(ctx,13,this.color,this.glow);ctx.beginPath();ctx.ellipse(0,0,13,10,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1;for(let i=1;i<=3;i++){ctx.beginPath();ctx.ellipse(0,0,13*(i/3),10*(i/3),0,0,Math.PI*2);ctx.stroke();}
    for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*4,10);ctx.quadraticCurveTo(i*5,0,i*4,-10);ctx.stroke();}
  }
  _draw_conch(ctx){
    this._radGrad(ctx,15,this.color,this.glow);
    ctx.beginPath();ctx.moveTo(-5,13);ctx.bezierCurveTo(-18,5,-18,-10,-5,-14);ctx.bezierCurveTo(5,-17,17,-6,14,5);ctx.bezierCurveTo(12,13,6,17,-5,13);ctx.fill();ctx.stroke();
    ctx.fillStyle=hexAdj(this.color,25);ctx.strokeStyle=hexAdj(this.glow,10);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(-10,13);ctx.bezierCurveTo(-18,8,-20,0,-12,-5);ctx.bezierCurveTo(-5,-8,0,-6,-2,0);ctx.bezierCurveTo(-4,5,-8,10,-10,13);ctx.fill();ctx.stroke();
    ctx.strokeStyle=hexAdj(this.glow,10);ctx.lineWidth=1.2;ctx.beginPath();
    for(let t=0;t<Math.PI*2.2;t+=0.1){const r=2.5+t*1.5;if(r>12)break;ctx.lineTo(Math.cos(t)*r*0.8,Math.sin(t)*r*0.8-2);}ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.28)';ctx.beginPath();ctx.ellipse(4,-8,4,3,-0.5,0,Math.PI*2);ctx.fill();
  }
  _draw_nautilus(ctx){
    this._radGrad(ctx,14,this.color,this.glow);ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle=hexAdj(this.glow,-8);ctx.lineWidth=1.2;ctx.beginPath();
    for(let t=0;t<Math.PI*3.5;t+=0.08){const r=Math.exp(t*0.14)*1.5;if(r>13)break;ctx.lineTo(Math.cos(t)*r,Math.sin(t)*r);}ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=0.8;for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*14,Math.sin(a)*14);ctx.stroke();}
    ctx.fillStyle='rgba(255,255,255,0.25)';ctx.beginPath();ctx.arc(-4,-4,5,0,Math.PI*2);ctx.fill();
  }
  _draw_cowrie(ctx){
    this._radGrad(ctx,14,this.color,this.glow);ctx.beginPath();ctx.ellipse(0,0,10,14,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle=hexAdj(this.color,-30);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-7,2);ctx.lineTo(7,2);ctx.stroke();
    ctx.strokeStyle=hexAdj(this.color,-20);ctx.lineWidth=0.7;for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(i*2.2,2);ctx.lineTo(i*2.2,5);ctx.stroke();}
    ctx.fillStyle='rgba(255,255,255,0.55)';for(let i=-2;i<=2;i++){ctx.beginPath();ctx.arc(0,i*5,1.8,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='rgba(255,255,255,0.42)';ctx.beginPath();ctx.ellipse(-2,-5,4,3,0.4,0,Math.PI*2);ctx.fill();
  }
  _draw_abalone(ctx){
    const g=ctx.createLinearGradient(-14,0,14,0);g.addColorStop(0,'#7FFFD4');g.addColorStop(0.25,'#FF69B4');g.addColorStop(0.55,'#FFD700');g.addColorStop(0.8,'#00CED1');g.addColorStop(1,'#9370DB');
    ctx.fillStyle=g;ctx.strokeStyle=hexAdj(this.glow,-20);ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,14,10,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='rgba(0,0,40,0.5)';ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=0.5;
    for(let i=-3;i<=3;i++){ctx.beginPath();ctx.ellipse(i*3,-6,1.8,2,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    ctx.fillStyle='rgba(255,255,255,0.32)';ctx.beginPath();ctx.ellipse(-4,-2,6,4,0.3,0,Math.PI*2);ctx.fill();
  }
}

// ── Score Popup ───────────────────────────────────────────────────────────────
class ScorePopup {
  constructor(x,y,text,color='#FFD700'){this.x=x;this.y=y;this.text=text;this.color=color;this.life=this.maxLife=1.2;this.vy=-55;}
  update(dt){this.y+=this.vy*dt;this.vy*=0.96;this.life-=dt;return this.life>0;}
  draw(ctx){const t=this.life/this.maxLife;ctx.save();ctx.globalAlpha=t;ctx.font=`bold ${18+(1-t)*6}px Quicksand,sans-serif`;ctx.textAlign='center';ctx.strokeStyle='rgba(0,0,0,0.55)';ctx.lineWidth=3;ctx.strokeText(this.text,this.x,this.y);ctx.fillStyle=this.color;ctx.fillText(this.text,this.x,this.y);ctx.restore();}
}

// ── Game ───────────────────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.canvas=document.getElementById('gameCanvas');this.ctx=this.canvas.getContext('2d');
    this.canvas.width=W;this.canvas.height=H;
    this.state='start';this.score=0;this.highScore=parseInt(localStorage.getItem('shj_hs')||'0');
    this.shells=0;this.dist=0;this.speed=BASE_SPEED;this.playT=0;
    this.player=new Seahorse();this.bg=new BackgroundSystem();
    this.obstacles=[];this.eels=[];this.pickups=[];this.particles=[];this.popups=[];
    this.eelWarning=false;this.obTimer=0;this.shTimer=0;this.eelTimer=0;this.eelInterval=rand(7,12);
    this.lastTime=0;
    document.getElementById('hs-val').textContent=this.highScore;
    this._bindInput();
    requestAnimationFrame(t=>this._loop(t));
  }
  _bindInput() {
    window.addEventListener('keydown',e=>{
      if(['Space','ArrowUp','KeyW'].includes(e.code)){e.preventDefault();this._onJump();}
      if(['Escape','KeyP'].includes(e.code)){if(this.state==='playing')this._pause();else if(this.state==='paused')this._resume();}
    });
    this.canvas.addEventListener('touchstart',e=>{e.preventDefault();this._onJump();},{passive:false});
    document.getElementById('btn-play').onclick=()=>this._start();
    document.getElementById('btn-color').onclick=()=>{this.player.colorIdx=(this.player.colorIdx+1)%4;};
    document.getElementById('btn-resume').onclick=()=>this._resume();
    document.getElementById('btn-restart-pause').onclick=()=>this._start();
    document.getElementById('btn-retry').onclick=()=>this._start();
  }
  _onJump() {
    if(this.state==='start'){this._start();return;}if(this.state==='gameover'){this._start();return;}
    if(this.state!=='playing') return;
    if(!this.player.jump()) this.player.doubleJump();
    this._jumpParticles();
  }
  _start() {
    this.state='playing';this.score=0;this.shells=0;this.dist=0;this.speed=BASE_SPEED;this.playT=0;
    this.obstacles=[];this.eels=[];this.pickups=[];this.particles=[];this.popups=[];
    this.obTimer=0;this.shTimer=0;this.eelTimer=0;this.eelInterval=rand(7,12);this.eelWarning=false;
    const ci=this.player.colorIdx;this.player=new Seahorse();this.player.colorIdx=ci;
    this.bg=new BackgroundSystem();
    this._show('hud');this._hide('start-screen');this._hide('pause-menu');this._hide('gameover-screen');
    this._updateHUD();this.lastTime=performance.now();
  }
  _pause(){this.state='paused';this._show('pause-menu');}
  _resume(){this.state='playing';this._hide('pause-menu');this.lastTime=performance.now();}
  _gameOver() {
    this.state='gameover';
    if(this.score>this.highScore){this.highScore=this.score;localStorage.setItem('shj_hs',this.highScore);document.getElementById('go-best-label').classList.remove('hidden');}
    else document.getElementById('go-best-label').classList.add('hidden');
    document.getElementById('go-score').textContent=Math.floor(this.score);
    document.getElementById('go-shells').textContent=this.shells;
    document.getElementById('go-best').textContent=this.highScore;
    this._hide('hud');this._show('gameover-screen');
    this._burst(this.player.x,this.player.y+36,22,'#FF6B9D');
  }
  _show(id){document.getElementById(id).classList.remove('hidden');}
  _hide(id){document.getElementById(id).classList.add('hidden');}

  _loop(ts) {
    const dt=Math.min((ts-this.lastTime)/1000,0.05);this.lastTime=ts;
    this.bg.update(dt,this.state==='playing'?this.speed:90);
    this.player.update(dt,this.state==='playing');
    if(this.state==='playing') this._update(dt);
    else if(this.state==='gameover') this.particles=this.particles.filter(p=>p.update(dt));
    this._draw();
    requestAnimationFrame(t=>this._loop(t));
  }
  _update(dt) {
    this.playT+=dt;this.dist+=this.speed*dt/100;
    this.speed=Math.min(MAX_SPEED,BASE_SPEED+this.playT*SPEED_RAMP);
    this.score+=this.speed*dt*0.08;
    this.obTimer+=dt;const obI=Math.max(0.75,2.2-this.playT*0.005);
    if(this.obTimer>=obI){this.obTimer=0;this._spawnOb();}
    this.shTimer+=dt;if(this.shTimer>=1.6){this.shTimer=0;this._spawnShell();}
    this.eelTimer+=dt;
    if(this.eelTimer>=this.eelInterval&&!this.eels.some(e=>e.state>=EEL.WARN&&e.state<=EEL.VISIBLE)){this.eelTimer=0;this.eelInterval=Math.max(4,rand(6,10)-this.playT*0.01);this._spawnEel();}
    this.obstacles=this.obstacles.filter(o=>{o.update(dt,this.speed);return o.x>-80;});
    this.eels=this.eels.filter(e=>{e.update(dt,this.speed);return e.x>-100;});
    const eelActive=this.eels.some(e=>e.state===EEL.WARN||e.state===EEL.EMERGE||e.state===EEL.VISIBLE);
    if(!eelActive){this.eelWarning=false;this.player.doubleJumpReady=false;}
    this.pickups=this.pickups.filter(s=>{s.update(dt,this.speed);return !s.done&&s.x>-60;});
    this.particles=this.particles.filter(p=>p.update(dt));
    this.popups=this.popups.filter(p=>p.update(dt));
    if(this.player.bubbleTimer>0.1){this.player.bubbleTimer=0;this.particles.push(new Particle(this.player.x+rand(-6,6),this.player.y+rand(20,60),{vy:rand(-25,-55),vx:rand(-8,8),life:rand(0.5,1.1),size:rand(2,5),color:'rgba(155,225,255,0.70)',gravity:0}));}
    this._collide();this._updateHUD();
  }
  _spawnOb(){const c=Math.random()<0.28?2:1;for(let i=0;i<c;i++)this.obstacles.push(new Urchin(W+60+i*58));}
  _spawnShell(){this.pickups.push(new Shell(W+40,GROUND_Y-rand(60,210)));}
  _spawnEel(){const e=new Eel(W+110,()=>{this.player.enableDoubleJump();this.eelWarning=true;});e.start();this.eels.push(e);}
  _collide() {
    const ph={x:this.player.x-13,y:this.player.y,w:26,h:this.player.height*0.82};
    for(const o of this.obstacles)if(this._hit(ph,o.hitbox)){this._gameOver();return;}
    for(const e of this.eels){const hb=e.hitbox;if(hb&&this._hit(ph,hb)){this._gameOver();return;}}
    for(const s of this.pickups){
      if(s.flyProgress>0)continue;
      if(this._hit(ph,s.hitbox)){s.collect(W-70,25);this.shells++;this.score+=s.pts;const pc=s.rarity==='legendary'?'#FFD700':s.rarity==='rare'?'#FF69B4':'#FFF';this.popups.push(new ScorePopup(this.player.x,this.player.y,`+${s.pts}`,pc));this._burst(this.player.x,this.player.y+36,s.rarity==='legendary'?16:s.rarity==='rare'?10:6,s.color);this.player.collect();}
    }
  }
  _hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
  _jumpParticles(){if(this.player.onGround)return;for(let i=0;i<8;i++)this.particles.push(new Particle(this.player.x+rand(-8,8),this.player.y+this.player.height,{vy:rand(40,100),vx:rand(-50,50),life:rand(0.3,0.7),size:rand(3,6),color:'rgba(155,230,255,0.8)',gravity:60}));}
  _burst(x,y,n,color){for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2;this.particles.push(new Particle(x,y,{vx:Math.cos(a)*rand(55,140),vy:Math.sin(a)*rand(55,140),life:rand(0.5,1.0),size:rand(4,9),color,gravity:90,star:Math.random()<0.3}));}}
  _draw() {
    const ctx=this.ctx;ctx.clearRect(0,0,W,H);
    this.bg.draw(ctx);
    if(this.state!=='start'){for(const s of this.pickups)s.draw(ctx);for(const o of this.obstacles)o.draw(ctx);for(const e of this.eels)e.draw(ctx);}
    this.player.draw(ctx);
    for(const p of this.particles)p.draw(ctx);for(const p of this.popups)p.draw(ctx);
    if(this.state==='playing'&&this.eelWarning){const we=this.eels.find(e=>e.state===EEL.WARN);if(we)this._drawEelWarning(ctx,we.x);}
  }
  _drawEelWarning(ctx,eelX){
    const ax=clamp(eelX,80,W-80),ay=GROUND_Y-28,pulse=0.7+0.3*Math.sin(performance.now()*0.012);
    ctx.save();ctx.globalAlpha=pulse;ctx.fillStyle='#FFD700';ctx.strokeStyle='#FF4500';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax-13,ay-22);ctx.lineTo(ax+13,ay-22);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.font='bold 13px Quicksand,sans-serif';ctx.fillStyle='#FFD700';ctx.textAlign='center';ctx.fillText('JUMP!',ax,ay-28);ctx.restore();
  }
  _updateHUD(){document.getElementById('score-val').textContent=Math.floor(this.score);document.getElementById('shells-val').textContent=this.shells;document.getElementById('dist-val').textContent=Math.floor(this.dist)+'m';}
}

window.addEventListener('load',()=>{new Game();});
