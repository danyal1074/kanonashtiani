/* ===== W3: a small WebGL engine + the 3D «مسیر نخبه شدن» world (no external libraries) ===== */
export const W3=(()=>{
'use strict';
/* ---------- helpers ---------- */
const hex=h=>[(h>>16&255)/255,(h>>8&255)/255,(h&255)/255];
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const nrm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l]};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}
const jitc=(c,r,a)=>{const k=1+(r()-.5)*a;return [Math.min(1,c[0]*k),Math.min(1,c[1]*k),Math.min(1,c[2]*k)]};
/* affine 3x4 transforms: [a,b,c,tx, d,e,f,ty, g,h,i,tz] */
const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0];
const mm=(A,B)=>{const r=new Array(12);for(let i=0;i<3;i++){for(let j=0;j<3;j++)r[i*4+j]=A[i*4]*B[j]+A[i*4+1]*B[4+j]+A[i*4+2]*B[8+j];r[i*4+3]=A[i*4]*B[3]+A[i*4+1]*B[7]+A[i*4+2]*B[11]+A[i*4+3]}return r};
const T=(x,y,z)=>[1,0,0,x,0,1,0,y,0,0,1,z];
const Sc=(x,y,z)=>[x,0,0,0,0,y===undefined?x:y,0,0,0,0,z===undefined?x:z,0];
const Ry=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,0,s,0,0,1,0,0,-s,0,c,0]};
const Rx=a=>{const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0,0,c,-s,0,0,s,c,0]};
const Rz=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,-s,0,0,s,c,0,0,0,0,1,0]};
const ch=(...ms)=>ms.reduce((a,b)=>mm(a,b));
const ap=(M,p)=>[M[0]*p[0]+M[1]*p[1]+M[2]*p[2]+M[3],M[4]*p[0]+M[5]*p[1]+M[6]*p[2]+M[7],M[8]*p[0]+M[9]*p[1]+M[10]*p[2]+M[11]];
/* 4x4 column-major for the GPU */
function persp(f,a,n,fr){const t=1/Math.tan(f/2),nf=1/(n-fr);return new Float32Array([t/a,0,0,0,0,t,0,0,0,0,(fr+n)*nf,-1,0,0,2*fr*n*nf,0])}
function lookAt(e,c,u){const z=nrm(sub(e,c)),x=nrm(cross(u,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1])}
function m4(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o}
function m4aff(M){return new Float32Array([M[0],M[4],M[8],0,M[1],M[5],M[9],0,M[2],M[6],M[10],0,M[3],M[7],M[11],1])}

/* ---------- geometry builder ---------- */
class Geo{
  constructor(){this.p=[];this.n=[];this.c=[];this.a=[]}
  get count(){return this.p.length/3}
  tri(A,B,C,col,an,ctr){
    let n=nrm(cross(sub(B,A),sub(C,A)));
    if(ctr==='up'){if(n[1]<0)n=[-n[0],-n[1],-n[2]]}
    else if(ctr){const f=[(A[0]+B[0]+C[0])/3-ctr[0],(A[1]+B[1]+C[1])/3-ctr[1],(A[2]+B[2]+C[2])/3-ctr[2]];if(dot(n,f)<0)n=[-n[0],-n[1],-n[2]]}
    const cs=Array.isArray(col[0])?col:[col,col,col],as=Array.isArray(an[0])?an:[an,an,an],V=[A,B,C];
    for(let i=0;i<3;i++){this.p.push(V[i][0],V[i][1],V[i][2]);this.n.push(n[0],n[1],n[2]);this.c.push(cs[i][0],cs[i][1],cs[i][2]);this.a.push(as[i][0],as[i][1],as[i][2],as[i][3])}
  }
  quad(A,B,C,D,col,an,ctr){this.tri(A,B,C,col,an,ctr);this.tri(A,C,D,col,an,ctr)}
  quadV(A,B,C,D,col,an4,ctr){const c=Array.isArray(col[0])?col:[col,col,col,col],a=Array.isArray(an4[0])?an4:[an4,an4,an4,an4];this.tri(A,B,C,[c[0],c[1],c[2]],[a[0],a[1],a[2]],ctr);this.tri(A,C,D,[c[0],c[2],c[3]],[a[0],a[2],a[3]],ctr)}
  smooth(from){
    const m=new Map(),P=this.p,N=this.n,end=this.count;
    for(let i=from;i<end;i++){const k=P[i*3].toFixed(3)+','+P[i*3+1].toFixed(3)+','+P[i*3+2].toFixed(3);let s=m.get(k);if(!s){s=[0,0,0];m.set(k,s)}s[0]+=N[i*3];s[1]+=N[i*3+1];s[2]+=N[i*3+2]}
    for(let i=from;i<end;i++){const k=P[i*3].toFixed(3)+','+P[i*3+1].toFixed(3)+','+P[i*3+2].toFixed(3);const s=nrm(m.get(k));N[i*3]=s[0];N[i*3+1]=s[1];N[i*3+2]=s[2]}
  }
}
const Z4=[0,0,0,0];
const icoCache={};
function icosphere(d){
  if(icoCache[d])return icoCache[d];
  const t=(1+Math.sqrt(5))/2;let v=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(nrm);
  let f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let k=0;k<d;k++){const cache={},nf=[];const mid=(a,b)=>{const key=a<b?a+'_'+b:b+'_'+a;if(cache[key]!==undefined)return cache[key];v.push(nrm([(v[a][0]+v[b][0])/2,(v[a][1]+v[b][1])/2,(v[a][2]+v[b][2])/2]));return cache[key]=v.length-1};
    for(const [a,b,c] of f){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca])}f=nf}
  return icoCache[d]={v,f};
}
function ico(g,M,col,an,o={}){
  const {v,f}=icosphere(o.detail===undefined?1:o.detail),r=o.r,from=g.count;
  const vv=v.map(p=>{const k=o.jitter?1+(r()-.5)*o.jitter:1;return ap(M,[p[0]*k,p[1]*k,p[2]*k])});
  const ctr=ap(M,[0,0,0]);
  for(const [a,b,c] of f){const cc=o.colFn?[o.colFn(vv[a]),o.colFn(vv[b]),o.colFn(vv[c])]:col;g.tri(vv[a],vv[b],vv[c],cc,an,ctr)}
  if(o.smooth)g.smooth(from);
}
function cyl(g,M,r0,r1,h,seg,col,an,o={}){
  const ctr=ap(M,[0,h/2,0]),ring=(r,y)=>Array.from({length:seg},(_,i)=>{const a=i/seg*Math.PI*2+(o.rot||0);return ap(M,[Math.cos(a)*r,y,Math.sin(a)*r])});
  const B=ring(r0,0),U=ring(r1,h),cb=ap(M,[0,0,0]),ct=ap(M,[0,h,0]);const from=g.count;
  for(let i=0;i<seg;i++){const j=(i+1)%seg,cc=o.colFn?o.colFn(i):col;
    if(r1>0)g.quad(B[i],B[j],U[j],U[i],cc,an,ctr);else g.tri(B[i],B[j],ct,cc,an,ctr);
    if(o.caps!==false){g.tri(cb,B[j],B[i],o.capCol||cc,an,ctr);if(r1>0)g.tri(ct,U[i],U[j],o.topCol||o.capCol||cc,an,ctr)}}
  if(o.smooth)g.smooth(from);
}
function box(g,M,w,h,d,col,an){
  const x=w/2,y=h/2,z=d/2,P=[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]].map(p=>ap(M,p)),c=ap(M,[0,0,0]);
  const F=[[0,1,2,3],[4,5,6,7],[0,1,5,4],[3,2,6,7],[0,3,7,4],[1,2,6,5]];
  for(let i=0;i<6;i++){const q=F[i],cc=Array.isArray(col[0])?col[i]:col;g.quad(P[q[0]],P[q[1]],P[q[2]],P[q[3]],cc,an,c)}
}
function lathe(g,M,prof,seg,col,an,smooth){
  const from=g.count,pt=(i,j)=>{const a=j/seg*Math.PI*2;return ap(M,[Math.cos(a)*prof[i][0],prof[i][1],Math.sin(a)*prof[i][0]])};
  for(let i=0;i<prof.length-1;i++){const cy=(prof[i][1]+prof[i+1][1])/2,ctr=ap(M,[0,cy,0]);
    for(let j=0;j<seg;j++){const A=pt(i,j),B=pt(i,j+1),C=pt(i+1,j+1),D=pt(i+1,j);
      if(prof[i][0]===0)g.tri(A,C,D,col,an,ctr);else if(prof[i+1][0]===0)g.tri(A,B,C,col,an,ctr);else g.quad(A,B,C,D,col,an,ctr)}}
  if(smooth)g.smooth(from);
}
function torusArc(g,M,R,r,a0,a1,sa,sb,col,an){
  const from=g.count;
  const P=(u,v)=>{const cu=Math.cos(u),su=Math.sin(u),cv=Math.cos(v),sv=Math.sin(v);return ap(M,[(R+r*cv)*cu,(R+r*cv)*su,r*sv])};
  for(let i=0;i<sa;i++){const u0=a0+(a1-a0)*i/sa,u1=a0+(a1-a0)*(i+1)/sa,um=(u0+u1)/2,ctr=ap(M,[R*Math.cos(um),R*Math.sin(um),0]);
    for(let j=0;j<sb;j++){const v0=j/sb*Math.PI*2,v1=(j+1)/sb*Math.PI*2;g.quad(P(u0,v0),P(u1,v0),P(u1,v1),P(u0,v1),col,an,ctr)}}
  g.smooth(from);
}
function extrude(g,M,pts,depth,col,an){
  const z=depth/2,F=pts.map(p=>ap(M,[p[0],p[1],z])),B=pts.map(p=>ap(M,[p[0],p[1],-z])),cf=ap(M,[0,0,z]),cb=ap(M,[0,0,-z]),ctr=ap(M,[0,0,0]),n=pts.length;
  for(let i=0;i<n;i++){const j=(i+1)%n;g.tri(cf,F[i],F[j],col,an,ctr);g.tri(cb,B[j],B[i],col,an,ctr);g.quad(F[i],F[j],B[j],B[i],col,an,ctr)}
}
const starPts=(R,r,n=5)=>Array.from({length:n*2},(_,i)=>{const a=Math.PI/2+i*Math.PI/n,rr=i%2?r:R;return [Math.cos(a)*rr,Math.sin(a)*rr]});

/* ---------- world layout ---------- */
const gs=(x,z,cx,cz,sx,sz)=>Math.exp(-(((x-cx)/sx)**2+((z-cz)/sz)**2));
function Hraw(x,z){
  let hill=9.9*gs(x,z,0,-13.2,7.2,8.2);hill=hill>9?9+(hill-9)*.12:hill;
  let h=hill+2.3*gs(x,z,0,3,12,11)+3.6*gs(x,z,17,-9,8,9)+2.8*gs(x,z,-21,-17,10,10)+1.4*gs(x,z,-10.7,-12.5,4.5,4)+1.3*gs(x,z,14,12,9,7);
  h+=.22*Math.sin(x*.55+1.3)*Math.cos(z*.47)+.12*Math.sin(x*1.7+z*1.1)+.07*Math.cos(x*2.3-z*1.9);
  const r=Math.hypot(x,(z+10)*1.1);h+=Math.min(Math.max(0,r-38)*.1,5)+1.6*Math.sin(x*.07+1.)*Math.cos(z*.05)*sstep(40,70,r);
  return h;
}
const PATH_CP=[[1.3,11.6],[.2,8.9],[-2.3,7],[-3.2,4.1],[-1.1,1.5],[2.5,-.4],[3.4,-3.3],[1.2,-5.7],[-2,-7.3],[-2.6,-9.7],[-1,-11.5],[0,-12.5]];
const RIVER_CP=[[-6.6,-7.3],[-7.6,-4.4],[-9.7,-.9],[-12.6,3],[-16.2,7],[-21,12],[-27,18],[-34,25]];
function catmull(pts,per){
  const out=[];const P=i=>pts[clamp(i,0,pts.length-1)];
  for(let i=0;i<pts.length-1;i++){const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);
    for(let k=0;k<per;k++){const t=k/per,t2=t*t,t3=t2*t;out.push([0,1].map(d=>.5*(2*p1[d]+(-p0[d]+p2[d])*t+(2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*t2+(-p0[d]+3*p1[d]-3*p2[d]+p3[d])*t3)))}}
  out.push(pts[pts.length-1].slice());return out;
}
function resample(pts,n){
  const L=[0];for(let i=1;i<pts.length;i++)L.push(L[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const tot=L[L.length-1],out=[];let j=0;
  for(let k=0;k<n;k++){const s=tot*k/(n-1);while(j<L.length-2&&L[j+1]<s)j++;const t=(s-L[j])/((L[j+1]-L[j])||1);out.push([pts[j][0]+(pts[j+1][0]-pts[j][0])*t,pts[j][1]+(pts[j+1][1]-pts[j][1])*t,s])}
  return {pts:out,len:tot};
}
let WORLD=null;let STAGE=0;
function layout(){
  const path=resample(catmull(PATH_CP,24),240).pts;
  let yc=path.map(p=>Hraw(p[0],p[1]));
  for(let pass=0;pass<6;pass++)yc=yc.map((y,i)=>{let s=0,c=0;for(let k=-4;k<=4;k++){const j=clamp(i+k,0,yc.length-1);s+=yc[j];c++}return s/c});
  for(let i=1;i<yc.length;i++)yc[i]=Math.max(yc[i],yc[i-1]-.02);
  path.forEach((p,i)=>p.push(yc[i]));
  const river=resample(catmull(RIVER_CP,10),90).pts;
  return {path,river};
}
function heightAt(x,z,L){
  let h=Hraw(x,z);
  let bd=1e9,by=0;for(const p of L.path){const d=(p[0]-x)**2+(p[1]-z)**2;if(d<bd){bd=d;by=p[3]}}
  bd=Math.sqrt(bd);
  if(bd<1.15)h=by-.02;else if(bd<2.4){const t=sstep(1.15,2.4,bd);h=(by-.02)*(1-t)+h*t}
  let rd=1e9;for(const p of L.river){const d=(p[0]-x)**2+(p[1]-z)**2;if(d<rd)rd=d}rd=Math.sqrt(rd);
  if(rd<1.45)h-=.5*(1-(rd/1.45)**2);
  const pd=Math.hypot(x+6.6,z+7.3);if(pd<2)h-=.45*(1-(pd/2)**2);
  return h;
}
const distPath=(x,z,L)=>{let b=1e9;for(const p of L.path){const d=(p[0]-x)**2+(p[1]-z)**2;if(d<b)b=d}return Math.sqrt(b)};
const distRiver=(x,z,L)=>{let b=1e9;for(const p of L.river){const d=(p[0]-x)**2+(p[1]-z)**2;if(d<b)b=d}return Math.sqrt(b)};

function buildWorld(){
  const L=layout(),r=rng(20261102),g=new Geo(),spr=[],shd=[],anchors={},signs=[];
  const H=(x,z)=>heightAt(x,z,L);
  const S=(c,size,kind,ph,flat,col,list)=>(list||spr).push({c,size,kind,ph,flat,col});
  /* --- sky dome (type 10, unlit) --- */
  {const top=hex(0x2f8ae6),mid=hex(0x7cc0f4),hor=hex(0xd8eefc),R=700,sa=24,sb=12;
   const P=(i,j)=>{const th=j/sa*Math.PI*2,ph=-.15+i/sb*(Math.PI/2+.15);return [Math.cos(ph)*Math.cos(th)*R,Math.sin(ph)*R-40,Math.cos(ph)*Math.sin(th)*R]};
   const C=y=>{const t=clamp((y+40)/(R*.9),0,1);return t<.1?mixc(hor,mid,t/.1):mixc(mid,top,Math.min(1,(t-.1)/.3))};
   for(let i=0;i<sb;i++)for(let j=0;j<sa;j++){const A=P(i,j),B=P(i,j+1),Cc=P(i+1,j+1),D=P(i+1,j);g.quadV(A,B,Cc,D,[C(A[1]),C(B[1]),C(Cc[1]),C(D[1])],[10,0,0,0]);}
  }
  /* --- mountains --- */
  const mts=[[-70,-128,30,52],[-30,-150,38,70],[16,-140,32,60],[62,-132,30,54],[105,-110,28,44],[-110,-104,26,40],[-48,-175,36,72],[44,-178,36,76],[0,-200,46,88],[-140,-150,34,58],[140,-150,34,60]];
  for(const [mx,mz,mr0,mh0] of mts){const mr=mr0*.95,mh=mh0*.5;
    const seg=9,rings=4,base=Hraw(mx,mz)-6,V=[];
    for(let i=0;i<=rings;i++){const t=i/rings,row=[];for(let j=0;j<seg;j++){const a=j/seg*Math.PI*2+mx;const rr=mr*(1-t)*(i===rings?0:1)*(1+(r()-.5)*.28*(i>0&&i<rings?1:0));row.push([mx+Math.cos(a)*rr,base+mh*t+(i>0&&i<rings?(r()-.5)*mh*.08:0),mz+Math.sin(a)*rr])}V.push(row)}
    const ctr=[mx,base+mh*.3,mz];
    for(let i=0;i<rings;i++)for(let j=0;j<seg;j++){const k=(j+1)%seg,A=V[i][j],B=V[i][k],C=V[i+1][k],D=V[i+1][j],yy=(A[1]+B[1]+C[1]+D[1])/4,t=(yy-base)/mh;
      const col=t>.58?jitc(hex(0xf6f8ff),r,.04):jitc(mixc(hex(0x8696cc),hex(0xb4bfe6),t),r,.1);
      if(i===rings-1)g.tri(A,B,C,col,Z4,ctr);else g.quad(A,B,C,D,col,Z4,ctr)}
  }
  /* --- path ribbon with curbs & tiles --- */
  {const P=L.path,tileA=hex(0xf6e7ca),tileB=hex(0xebd6b0),curbT=hex(0xdcc08f),curbS=hex(0xc6a473);
   const pts=P.map((p,i)=>{const q=P[Math.min(i+1,P.length-1)],o=P[Math.max(i-1,0)];const tx=q[0]-o[0],tz=q[1]-o[1],l=Math.hypot(tx,tz)||1;return {x:p[0],z:p[1],y:p[3]+.05,nx:-tz/l,nz:tx/l,s:p[2]}});
   const at=(q,o,dy)=>[q.x+q.nx*o,q.y+dy,q.z+q.nz*o];
   for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],tc=Math.floor(a.s/.95)%2?tileA:tileB;
     g.quad(at(a,.9,0),at(b,.9,0),at(b,-.9,0),at(a,-.9,0),tc,Z4,'up');
     if(Math.floor(a.s/.95)!==Math.floor(b.s/.95)){const gr=hex(0xcfb487),ga=at(a,.9,.008),gb=at(a,-.9,.008),gc=at(b,-.9,.008),gd=at(b,.9,.008);g.quad(ga,gb,[gb[0]+(gc[0]-gb[0])*.35,gb[1],gb[2]+(gc[2]-gb[2])*.35],[ga[0]+(gd[0]-ga[0])*.35,ga[1],ga[2]+(gd[2]-ga[2])*.35],gr,Z4,'up')}
     for(const sd of [1,-1]){const i0=.9*sd,o0=1.1*sd;
       g.quad(at(a,i0,.13),at(b,i0,.13),at(b,o0,.13),at(a,o0,.13),curbT,Z4,'up');
       g.quad(at(a,i0,0),at(b,i0,0),at(b,i0,.13),at(a,i0,.13),curbS,Z4,null);
       g.quad(at(a,o0,.13),at(b,o0,.13),at(b,o0,-.3),at(a,o0,-.3),curbS,Z4,null)}}
   L.pp=pts;
  }
  /* --- stations --- */
  const stDef=[{f:.035,col:0x2f80ed,flag:0xffcc1a,id:'st0'},{f:.18,col:0x2f80ed,flag:0xffcc1a,id:'st1'},{f:.32,col:0x8e44ec,id:'st2'},{f:.46,col:0xff8a1f,flag:0xff6a1f,id:'st3'},{f:.60,col:0x9aa7ba,id:'m1'},{f:.74,col:0x9aa7ba,id:'m2'},{f:.86,col:0x9aa7ba,id:'m3'}].map((s,i)=>({...s,cur:i===STAGE,lock:i>STAGE,col:i>STAGE?0x9aa7ba:s.col}));
  for(const s of stDef){
    const i=Math.round(s.f*(L.pp.length-1)),q=L.pp[i],x=q.x,z=q.z,y=q.y+.02,col=hex(s.col);
    cyl(g,T(x,y-.05,z),1.0,1.0,.16,24,mixc(col,[0,0,0],.25),Z4,{topCol:mixc(col,[0,0,0],.15)});
    cyl(g,T(x,y+.11,z),.86,.82,.26,24,col,Z4,{topCol:mixc(col,[1,1,1],.18),smooth:false});
    cyl(g,T(x,y+.37,z),.62,.6,.05,24,mixc(col,[1,1,1],.32),Z4);
    const top=y+.43,white=[1,1,1];
    if(s.cur){extrude(g,ch(T(x,top+.04,z),Rx(-Math.PI/2)),starPts(.42,.18),.08,hex(0xfff3c4),Z4)}
    else if(s.lock){const lc=hex(0xe9edf3);box(g,T(x,top+.2,z+.04),.46,.36,.22,lc,Z4);torusArc(g,T(x,top+.38,z+.04),.15,.045,0,Math.PI,8,6,lc,Z4)}
    else{const seg=(p,q)=>{const dx=q[0]-p[0],dz=q[1]-p[1],l=Math.hypot(dx,dz);box(g,ch(T(x+(p[0]+q[0])/2,top+.03,z+(p[1]+q[1])/2),Ry(Math.atan2(-dz,dx))),l+.14,.08,.15,white,Z4)};seg([-.36,-.02],[-.1,.22]);seg([-.1,.22],[.4,-.3])}
    if(s.flag){const px=x-.62,pz=z-.18;cyl(g,T(px,y,pz),.045,.045,1.75,8,hex(0xf2f2f2),Z4);ico(g,ch(T(px,y+1.8,pz),Sc(.09)),hex(0xffd23f),Z4,{detail:1,smooth:true});
      flag(g,[px+.03,y+1.72,pz],.95,.62,hex(s.flag),r()*6,false)}
    anchors[s.id]=[x,top+.1,z];
    S([x,q.y+.02,z],1.5,4,0,1,[0,0,0],shd);
    if(s.cur){S([x,top+.02,z],2.6,3,0,1,[1,.85,.35]);S([x,top+.02,z],2.6,3,.5,1,[1,.95,.7]);S([x,top+.3,z],2.2,0,0,0,[1,.75,.3]);anchors.you=[x,top+.3,z]}
  }
  /* --- summit: trophy, flag, rocks --- */
  const tx=0,tz=-13.55,ty0=H(tx,tz),ty=ty0+.85;
  {const rk=[[0,0,1.75,.82,1.45],[-1.15,.35,1.05,.62,1],[1.2,.3,1.1,.6,1],[-.5,-.95,1.2,.7,1.05],[.7,-.9,1.1,.66,1],[0,.95,.9,.35,.7]];
   for(const [dx,dz,sx,sy,sz] of rk){const x=tx+dx,z=tz+dz;ico(g,ch(T(x,ty0+sy*.42,z),Ry(r()*6),Sc(sx,sy,sz)),Z4,Z4,{detail:1,jitter:.22,r,colFn:p=>jitc(mixc(hex(0x8f93ad),hex(0xc0c3d6),clamp((p[1]-ty0)/1.1,0,1)),r,.06)})}
   S([tx,ty0+.03,tz],4.6,4,0,1,[0,0,0],shd)}
  box(g,T(tx,ty+.2,tz),2.1,.4,1.7,hex(0xc5861a),Z4);
  box(g,T(tx,ty+.55,tz),1.6,.32,1.25,hex(0xe0a422),Z4);
  const TA=[5,tx,tz,1],gold=hex(0xffc22e),gold2=hex(0xffd75a);
  lathe(g,T(tx,ty+.71,tz),[[0,0],[.48,0],[.48,.12],[.24,.26],[.17,.62],[.3,.78],[.22,.86],[0,.86]],28,gold,TA,true);
  lathe(g,T(tx,ty+1.55,tz),[[0,0],[.36,.03],[.78,.28],[1.0,.72],[1.1,1.22],[1.15,1.6],[1.25,1.68],[1.16,1.74],[1.02,1.66],[.92,1.2],[.6,.7],[0,.55]],32,gold,TA,true);
  for(const sd of [1,-1])torusArc(g,ch(T(tx+sd*1.06,ty+2.55,tz),Sc(sd,1,1)),.46,.1,-1.75,1.75,14,8,gold2,TA);
  extrude(g,ch(T(tx,ty+2.45,tz+1.04),Rx(-.12)),starPts(.42,.19),.12,hex(0xfff0a0),TA);
  anchors.trophy=[tx,ty+.35,tz+1.05];if(STAGE===7)anchors.you=[tx,ty+.65,tz+1.05];
  S([tx,ty+2.4,tz-.6],6.2,0,0,0,[1,.82,.38]);S([6,34,-150],120,0,0,0,[.55,.48,.3]);S([30,62,-170],34,0,0,0,[1,.95,.78]);S([30,62,-170],14,0,1.5,0,[1,1,.95]);S([tx,ty+2.6,tz-1.4],15,2,0,0,[1,.93,.7]);
  for(let i=0;i<9;i++){const a=r()*Math.PI*2,rad=1.4+r()*1.6;S([tx+Math.cos(a)*rad,ty+1.4+r()*2.6,tz+Math.sin(a)*rad*.6+.4],.8+r()*.7,1,r(),0,[1,.97,.82])}
  S([tx,ty+.02,tz],3.2,4,0,1,[0,0,0],shd);
  {const px=2.2,pz=-13.0,py=H(px,pz);cyl(g,T(px,py,pz),.06,.06,2.9,8,hex(0xe9a23b),Z4);ico(g,ch(T(px,py+2.95,pz),Sc(.12)),hex(0xffd23f),Z4,{smooth:true});flag(g,[px+.04,py+2.85,pz],1.35,.8,hex(0xff3b30),r()*6,true)}
  for(let i=0;i<11;i++){const a=-Math.PI/2+.55+i*(Math.PI*2-1.1)/11+(r()-.5)*.2,rad=2.2+r()*.9,x=tx+Math.cos(a)*rad,z=tz+Math.sin(a)*rad;if(distPath(x,z,L)<1.4)continue;rock(x,z,.5+r()*.55)}
  function rock(x,z,s,col){const y=H(x,z);ico(g,ch(T(x,y+s*.25,z),Ry(r()*6),Sc(s*(1+r()*.4),s*(.6+r()*.3),s*(1+r()*.3))),Z4,Z4,{detail:1,jitter:.32,r,colFn:p=>jitc(mixc(hex(col||0x9a9cb7),hex(0xb9bccf),clamp((p[1]-y)/(s*1.2),0,1)),r,.07)});S([x,y+.03,z],s*2.4,4,0,1,[0,0,0],shd)}
  /* --- rocks along the way --- */
  for(let k=0;k<70&&true;k++){const x=(r()-.5)*44,z=-24+r()*40;if(distPath(x,z,L)<2.2||distRiver(x,z,L)<1.8||Math.hypot(x-tx,z-tz)<3.2)continue;if(r()<.55)continue;rock(x,z,.35+r()*.75)}
  /* --- flag builder --- */
  function flag(g,base,w,h,col,ph,notch){
    const nx=8,ny=3;const V=(i,j)=>{let x=i/nx*w;const y=j/ny*h;if(notch&&j>0&&j<ny&&i===nx)x-= w*.22*(1-Math.abs(j/ny-.5)*2);return [base[0]+x,base[1]-y,base[2]]};
    for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const A=V(i,j),B=V(i+1,j),C=V(i+1,j+1),D=V(i,j+1);const an=p=>[2,p[0]-base[0],ph,0];const shade=1-.1*(j/ny);const cc=[col[0]*shade,col[1]*shade,col[2]*shade];g.quadV(A,B,C,D,cc,[an(A),an(B),an(C),an(D)],null);}
  }
  /* --- trees --- */
  const pines=[[6.2,-4.2],[7.6,-7.4],[5.6,-10.4],[9.4,-2.2],[10.6,-6.4],[4.4,-16.6],[-5.2,-16.4],[8.4,-14.2],[12.4,-11],[-12.6,-13.2],[-7.4,4.6],[8.8,6.4],[10.6,2.6],[-3.6,-19],[2.2,-19.5],[13.5,-15],[-15.5,-6],[15,4]];
  for(const [x,z] of pines){if(distPath(x,z,L)<2)continue;const y=H(x,z),s=.85+r()*.55,ph=r()*6;
    cyl(g,T(x,y,z),.16*s,.12*s,.7*s,6,hex(0x8a5a2b),Z4);
    const cols=[0x2c8a3e,0x35a047,0x46b556];
    for(let k=0;k<3;k++){const by=y+(.5+k*.95)*s,rr=(1.25-k*.3)*s;cyl(g,T(x,by,z),rr,0,1.45*s,9,jitc(hex(cols[k]),r,.12),[1,ph,y+.4*s,.022],{rot:r()*3,capCol:hex(0x24733a)})}
    S([x,y+.03,z],2.6*s,4,0,1,[0,0,0],shd)}
  const rounds=[[-13.8,-1.6,1.25],[-7.8,7.4,1],[11.6,9.6,1.05],[13.4,-1,1],[-17,-9,1.15],[16.5,-12,.95],[-11,10,.9]];
  for(const [x,z,s] of rounds){if(distPath(x,z,L)<2.4||distRiver(x,z,L)<1.6)continue;const y=H(x,z),ph=r()*6;
    cyl(g,T(x,y,z),.26*s,.18*s,2.1*s,7,hex(0x8a5a2b),Z4);
    for(let k=0;k<5;k++){const ox=(r()-.5)*1.5*s,oz=(r()-.5)*1.3*s,oy=2.3*s+r()*.9*s,rr=(.95+r()*.6)*s;const cc=jitc(hex([0x8cc63f,0x7bbd36,0x9ad14b,0x6db33a][k%4]),r,.1);
      ico(g,ch(T(x+ox,y+oy,z+oz),Sc(rr)),cc,[1,ph,y+1.6*s,.03],{detail:1,smooth:true})}
    S([x,y+.03,z],3.6*s,4,0,1,[0,0,0],shd)}
  /* --- bushes, flowers, grass tufts --- */
  for(let k=0;k<26;k++){const i=Math.floor(r()*L.pp.length),q=L.pp[i],sd=r()<.5?1:-1,o=1.6+r()*1.1,x=q.x+q.nx*o*sd,z=q.z+q.nz*o*sd;if(distPath(x,z,L)<1.45)continue;const y=H(x,z),s=.35+r()*.3;
    ico(g,ch(T(x,y+s*.55,z),Sc(s*1.3,s,s*1.2)),jitc(hex(0x58b23f),r,.15),[1,r()*6,y,.03],{detail:1,smooth:true})}
  const fcol=[0xff6fa8,0xffb020,0xfff176,0xff7043,0xffffff,0xc77dff];
  for(let k=0;k<170;k++){const i=Math.floor(r()*L.pp.length),q=L.pp[i],sd=r()<.5?1:-1,o=1.4+r()*3.2,x=q.x+q.nx*o*sd+(r()-.5),z=q.z+q.nz*o*sd+(r()-.5);if(distPath(x,z,L)<1.35||distRiver(x,z,L)<1.6)continue;const y=H(x,z);
    cyl(g,T(x,y,z),.025,.02,.22,3,hex(0x3e9b34),Z4,{caps:false});ico(g,ch(T(x,y+.26,z),Sc(.12,.08,.12)),jitc(hex(fcol[k%fcol.length]),r,.08),[1,r()*6,y,.05],{detail:0})}
  for(let k=0;k<320;k++){const x=(r()-.5)*40,z=-22+r()*36;if(distPath(x,z,L)<1.3||distRiver(x,z,L)<1.5)continue;const y=H(x,z),s=.25+r()*.3;
    cyl(g,ch(T(x,y-.02,z),Ry(r()*3)),s*.35,0,s,3,jitc(hex(0x4ea53a),r,.2),[1,r()*6,y,.06],{caps:false})}
  /* --- waterfall, cliff, pool, river --- */
  {const wx=-6.6,gy=H(wx,-9.6),topY=gy+3.4,poolY=Hraw(wx,-7.3)-.18,DX=2.8,DZ=-2;
   const cliff=[[-10.9,-8.4,1.5,1.5],[-7.9,-8.5,1.4,1.4],[-12,-7.4,1.1,.9],[-9.4,-9.9,2,2.2],[-11,-9.4,1.5,2.4],[-7.8,-9.6,1.4,2.2]];
   for(const [x0,z0,s,hy] of cliff){const x=x0+DX,z=z0+DZ,y=H(x,z);ico(g,ch(T(x,y+hy*s*.6,z),Ry(r()*6),Sc(s*1.2,s*hy,s)),Z4,Z4,{detail:1,jitter:.28,r,colFn:p=>p[1]>y+hy*s*1.25?jitc(hex(0x6fbf45),r,.1):jitc(mixc(hex(0x8e91ab),hex(0xb3b6ca),clamp((p[1]-y)/(hy*s*1.6),0,1)),r,.08)})}
   const wcol=hex(0x8fdcff),W=2.0,rows=12,z0=-9.15,z1=-7.9;
   for(let i=0;i<rows;i++){const t0=i/rows,t1=(i+1)/rows,y0=topY+(poolY-topY)*t0,y1=topY+(poolY-topY)*t1,za=z0+(z1-z0)*t0*t0,zb=z0+(z1-z0)*t1*t1;
     for(let j=0;j<4;j++){const xa=wx-W/2+W*j/4,xb=wx-W/2+W*(j+1)/4;const an=(s,u)=>[9,s,u,1.4];g.quadV([xa,y0,za],[xb,y0,za],[xb,y1,zb],[xa,y1,zb],wcol,[an(t0*4,xa),an(t0*4,xb),an(t1*4,xb),an(t1*4,xa)],null)}}
   const pc=[wx,poolY,-7.3];
   for(let j=0;j<20;j++){const a0=j/20*Math.PI*2,a1=(j+1)/20*Math.PI*2;g.tri(pc,[wx+Math.cos(a0)*1.95,poolY,-7.3+Math.sin(a0)*1.6],[wx+Math.cos(a1)*1.95,poolY,-7.3+Math.sin(a1)*1.6],hex(0x5fc4f5),[[9,0,0,.5],[9,1.6,a0,.5],[9,1.6,a1,.5]],'up')}
   const R=L.river;for(let i=0;i<R.length-1;i++){const a=R[i],b=R[i+1],c=R[Math.min(i+2,R.length-1)];const n=(p,q)=>{const tx=q[0]-p[0],tz=q[1]-p[1],l=Math.hypot(tx,tz)||1;return [-tz/l,tx/l]};const na=n(a,b),nb=n(b,c);
     const ya=Hraw(a[0],a[1])-.2,yb=Hraw(b[0],b[1])-.2,w=1.25;const A1=[a[0]+na[0]*w,ya,a[1]+na[1]*w],A2=[a[0]-na[0]*w,ya,a[1]-na[1]*w],B1=[b[0]+nb[0]*w,yb,b[1]+nb[1]*w],B2=[b[0]-nb[0]*w,yb,b[1]-nb[1]*w];
     g.quadV(A1,B1,B2,A2,hex(0x58c0f2),[[9,a[2],1,1],[9,b[2],1,1],[9,b[2],-1,1],[9,a[2],-1,1]],'up')}
   for(let k=0;k<9;k++)S([wx+(r()-.5)*1.8,poolY+.25+r()*.45,-7.8+r()*.6],1+r()*.8,0,r()*6,0,[.8,.92,1]);
   S([wx,poolY+.9,-7.6],4.2,0,2,0,[.45,.55,.62]);
   for(let i=4;i<L.river.length-4;i+=7){const q=L.river[i];S([q[0]+(r()-.5)*1.2,Hraw(q[0],q[1])-.1,q[1]+(r()-.5)*1.2],.9+r()*.5,1,r(),0,[1,1,1])}
   for(let k=0;k<6;k++)S([wx+(r()-.5)*1.2,topY-r()*3,-8.6+r()*.5],.55,1,r(),0,[1,1,1]);
   anchors.fall=[wx,topY,-8.6];
  }
  /* --- wooden signs --- */
  function signBoard(x,z,rot,w,h,postH,id,capOn){
    const y=H(x,z),M=ch(T(x,y,z),Ry(rot)),wood=hex(0xd29452),dark=hex(0xa56a2e);
    for(const sd of [-1,1])box(g,mm(M,T(sd*w*.32,(postH)/2,-.05)),.22,postH,.22,dark,Z4);
    box(g,mm(M,T(0,postH+h/2,0)),w+.3,h+.3,.18,dark,Z4);
    box(g,mm(M,T(0,postH+h/2,.03)),w,h,.2,wood,Z4);
    const q=[[-w/2,postH,.14],[w/2,postH,.14],[w/2,postH+h,.14],[-w/2,postH+h,.14]].map(p=>ap(M,p));
    signs.push({id,q});
    if(capOn){const cm=mm(M,T(w*.38,postH+h+.2,0));cyl(g,cm,.36,.38,.32,10,hex(0x1f3c8f),Z4);box(g,ch(cm,T(0,.38,0),Ry(.78)),1.15,.1,1.15,hex(0x2a4fb8),Z4);box(g,mm(cm,T(.48,.1,.3)),.06,.55,.06,hex(0xffc22e),Z4);ico(g,ch(cm,T(.48,-.22,.3),Sc(.1)),hex(0xffc22e),Z4,{detail:0})}
    S([x,y+.03,z],w*.9,4,0,1,[0,0,0],shd);
    return ap(M,[0,postH+h/2,.2]);
  }
  anchors.sign=signBoard(-4.3,-1.2,.22,3.3,1.9,1.5,'title',true);
  anchors.start=signBoard(-4.4,8.6,.32,2.3,.85,.55,'start',false);
  /* --- clouds (type 4 drift) --- */
  const cl=[[-40,34,-85],[10,40,-100],[44,31,-80],[-12,28,-72],[-70,38,-95],[30,46,-120],[75,36,-100],[-25,44,-125]];
  for(const [x,y,z] of cl){const sp=.6+r()*.6,off=r()*120;for(let k=0;k<6;k++){const ox=(k-2.5)*4.2+(r()-.5)*2,oy=(r()-.2)*2.4*(k%2?1:.6),rr=3+r()*3;
    ico(g,ch(T(x+ox,y+oy,z+(r()-.5)*3),Sc(rr*1.25,rr*.85,rr)),Z4,[4,sp,off,x],{detail:1,smooth:true,colFn:p=>p[1]<y-1?hex(0xe6effa):hex(0xffffff)})}}
  /* --- fireflies / pollen --- */
  for(let k=0;k<26;k++){const x=(r()-.5)*24,z=-14+r()*24;if(distPath(x,z,L)<1)continue;S([x,H(x,z)+.25,z],.42+r()*.25,5,r(),0,[1,.95,.6])}
  WORLD={g,spr,shd,anchors,signs,L};
  return WORLD;
}

/* ---------- shaders ---------- */
const VS_LIT=`attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;attribute vec4 aA;
uniform mat4 uPV;uniform mat4 uM;uniform float uT;uniform float uPh;uniform float uFlap;
varying vec3 vC;varying vec3 vN;varying vec3 vW;varying float vK;varying vec2 vS;
void main(){vec3 p=aP;vec3 n=aN;float k=aA.x;
 if(k>.5&&k<1.5){float h=max(p.y-aA.z,0.);float w=(sin(uT*1.5+aA.y)+.4*sin(uT*2.7+aA.y*1.7))*aA.w*h;p.x+=w;p.z+=w*.55;}
 else if(k>1.5&&k<2.5){float d=aA.y;p.z+=sin(d*3.4-uT*5.2+aA.z)*.17*d;p.y+=sin(d*2.1-uT*3.1+aA.z)*.03*d;}
 else if(k>3.5&&k<4.5){float cx=aA.w;float nx=mod(cx+uT*aA.y+aA.z+170.,340.)-170.;p.x+=nx-cx;}
 else if(k>4.5&&k<5.5){float a=sin(uT*.7)*.55;vec2 c=aA.yz;vec2 q=p.xz-c;float cs=cos(a),sn=sin(a);p.xz=c+vec2(q.x*cs-q.y*sn,q.x*sn+q.y*cs);n.xz=vec2(n.x*cs-n.z*sn,n.x*sn+n.z*cs);p.y+=sin(uT*1.3)*.07;}
 else if(k>5.5&&k<6.5){float a=aA.y*(.2+1.05*abs(sin(uT*uFlap+uPh)));float cs=cos(a),sn=sin(a);p.xy=vec2(p.x*cs-p.y*sn,p.x*sn+p.y*cs);n.xy=vec2(n.x*cs-n.y*sn,n.x*sn+n.y*cs);}
 vec4 w=uM*vec4(p,1.);vW=w.xyz;vN=mat3(uM)*n;vC=aC;vK=k;vS=aA.yz;gl_Position=uPV*w;}`;
const FS_LIT=`precision mediump float;
varying vec3 vC;varying vec3 vN;varying vec3 vW;varying float vK;varying vec2 vS;
uniform vec3 uCam;uniform vec3 uSun;uniform vec3 uFog;uniform vec2 uFogR;uniform float uTf;uniform vec3 uTint;
void main(){vec3 col=vC*uTint;
 if(vK>9.5){gl_FragColor=vec4(col,1.);return;}
 vec3 n=normalize(vN);vec3 v=normalize(uCam-vW);if(dot(n,v)<0.)n=-n;
 if(vK>8.5){float s=vS.x;float st=sin(s*5.5-uTf*4.2+sin(vS.y*2.3+s)*1.6);col=mix(col,vec3(1.),smoothstep(.72,1.,st)*.6);col+=.08*sin(uTf*2.+s*3.);}
 float hemi=n.y*.5+.5;vec3 amb=mix(vec3(.55,.6,.48),vec3(.86,.92,1.),hemi)*.72;
 float dif=max(dot(n,uSun),0.);vec3 lit=col*(amb+vec3(1.,.96,.88)*dif*.5);
 float rim=pow(1.-max(dot(n,v),0.),3.);lit+=rim*.12*vec3(.9,.95,1.);
 if(vK>1.5&&vK<2.5){lit=col*(.92+dif*.18)+rim*.1;}
 if(vK>3.5&&vK<4.5){lit=col*(.9+.12*n.y)+rim*.06;}
 if(vK>4.5&&vK<5.5){vec3 h=normalize(uSun+v);float sp=max(dot(n,h),0.);lit=lit*1.22+col*.12;lit+=pow(sp,36.)*.9+pow(sp,5.)*.2*col;lit+=rim*.35*vec3(1.,.85,.4);}
 if(vK>8.5){vec3 h=normalize(uSun+v);lit+=pow(max(dot(n,h),0.),60.)*.7;}
 float d=length(vW-uCam);float f=clamp((d-uFogR.x)/(uFogR.y-uFogR.x),0.,1.);
 gl_FragColor=vec4(mix(lit,uFog,f*f*(3.-2.*f)),1.);}`;
const VS_SPR=`attribute vec3 aC;attribute vec2 aQ;attribute vec4 aK;attribute vec3 aCol;
uniform mat4 uPV;uniform vec3 uR;uniform vec3 uU;uniform float uT;
varying vec2 vQ;varying float vKind;varying float vPh;varying vec3 vCol;varying float vLife;
void main(){vec3 c=aC;float k=aK.y;vLife=0.;
 if(k>4.5){float l=fract(uT*.12+aK.z);vLife=l;c.y+=l*2.4;c.x+=sin(uT*.8+aK.z*40.)*.35;c.z+=cos(uT*.6+aK.z*30.)*.3;}
 vec3 off=aK.w>.5?vec3(aQ.x,0.,aQ.y)*aK.x*.5:(uR*aQ.x+uU*aQ.y)*aK.x*.5;
 vQ=aQ;vKind=k;vPh=aK.z;vCol=aCol;gl_Position=uPV*vec4(c+off,1.);}`;
const FS_SPR=`precision mediump float;
varying vec2 vQ;varying float vKind;varying float vPh;varying vec3 vCol;varying float vLife;uniform float uTf;
void main(){float r=length(vQ);float a=0.;
 if(vKind<.5){a=pow(max(0.,1.-r),2.)*(.72+.28*sin(uTf*1.6+vPh));}
 else if(vKind<1.5){float tw=pow(max(0.,sin(uTf*1.7+vPh*6.283)),5.);float cr=max(0.,1.-abs(vQ.x)*9.)*max(0.,1.-abs(vQ.y))+max(0.,1.-abs(vQ.y)*9.)*max(0.,1.-abs(vQ.x));a=(cr+pow(max(0.,1.-r),3.)*.7)*tw;}
 else if(vKind<2.5){float an=atan(vQ.y,vQ.x)+uTf*.07;float s=smoothstep(.3,.95,sin(an*14.));a=s*pow(max(0.,1.-r),1.7)*.3;}
 else if(vKind<3.5){float p=fract(uTf*.5+vPh);float rr=.25+.7*p;a=smoothstep(.1,0.,abs(r-rr))*(1.-p);}
 else if(vKind<4.5){a=smoothstep(1.,.1,r)*.32;}
 else{a=pow(max(0.,1.-r),2.4)*sin(vLife*3.1416)*(.65+.35*sin(uTf*5.+vPh*60.));}
 if(a<.004)discard;gl_FragColor=vec4(vCol*a,a);}`;
const VS_TEX=`attribute vec3 aP;attribute vec2 aUV;uniform mat4 uPV;varying vec2 vUV;varying vec3 vW;void main(){vUV=aUV;vW=aP;gl_Position=uPV*vec4(aP,1.);}`;
const FS_TEX=`precision mediump float;varying vec2 vUV;varying vec3 vW;uniform sampler2D uTex;uniform vec3 uCam;uniform vec3 uFog;uniform vec2 uFogR;
void main(){vec3 c=texture2D(uTex,vUV).rgb*.98;float d=length(vW-uCam);float f=clamp((d-uFogR.x)/(uFogR.y-uFogR.x),0.,1.);gl_FragColor=vec4(mix(c,uFog,f),1.);}`;

/* ---------- small dynamic meshes ---------- */
function butterflyGeo(){const g=new Geo();const wing=(sd)=>{const pts=[[0,0,0],[sd*.55,0,.25],[sd*.7,0,-.05],[sd*.5,0,-.3],[sd*.32,0,-.45],[sd*.1,0,-.2]];for(let i=1;i<pts.length-1;i++)g.tri(pts[0],pts[i],pts[i+1],[1,1,1],[6,sd,0,0],null)};wing(1);wing(-1);box(g,I(),.06,.06,.5,[.25,.18,.15],Z4);return g}
function birdGeo(){const g=new Geo();for(const sd of [1,-1]){g.tri([0,0,.12],[sd*.9,.05,-.1],[0,0,-.22],[.25,.3,.38],[6,sd,0,0],null)}return g}

/* ---------- runtime ---------- */
let st=null;
function compile(gl,vs,fs){const mk=(t,s)=>{const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh};
  const p=gl.createProgram();gl.attachShader(p,mk(gl.VERTEX_SHADER,vs));gl.attachShader(p,mk(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS),u={};for(let i=0;i<n;i++){const nm=gl.getActiveUniform(p,i).name;u[nm]=gl.getUniformLocation(p,nm)}
  const na=gl.getProgramParameter(p,gl.ACTIVE_ATTRIBUTES),a={};for(let i=0;i<na;i++){const nm=gl.getActiveAttrib(p,i).name;a[nm]=gl.getAttribLocation(p,nm)}
  return {p,u,a}}
function litBuffer(gl,g){const n=g.count,d=new Float32Array(n*13);for(let i=0;i<n;i++){d.set(g.p.slice(i*3,i*3+3),i*13);d.set(g.n.slice(i*3,i*3+3),i*13+3);d.set(g.c.slice(i*3,i*3+3),i*13+6);d.set(g.a.slice(i*4,i*4+4),i*13+9)}
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,d,gl.STATIC_DRAW);return {b,n}}
function sprBuffer(gl,list){const d=new Float32Array(list.length*6*12),Q=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];let o=0;
  for(const s of list)for(const q of Q){d.set([s.c[0],s.c[1],s.c[2],q[0],q[1],s.size,s.kind,s.ph,s.flat,s.col[0],s.col[1],s.col[2]],o);o+=12}
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,d,gl.STATIC_DRAW);return {b,n:list.length*6}}
function terrainData(L){
  const N=118,P=[],C=[],idx=[];const X=u=>Math.sign(u)*Math.pow(Math.abs(u),1.75)*95,Zf=v=>-6+Math.sign(v)*Math.pow(Math.abs(v),1.65)*(v<0?95:58);
  const Hs=[];const r=rng(7);
  for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const x=X(i/N*2-1),z=Zf(j/N*2-1),h=heightAt(x,z,L);P.push(x,h,z);Hs.push(h);
    const dp=distPath(x,z,L),dr=distRiver(x,z,L),n1=.5+.5*Math.sin(x*.31+z*.17)*Math.cos(z*.23-x*.11);
    let c=mixc(hex(0x82c946),hex(0x5aab3a),n1);c=mixc(c,hex(0x9ed65c),(1-sstep(1.2,3,dp))*.55);
    c=mixc(c,hex(0x63b84f),(1-sstep(1.3,2.6,dr))*.8);c=mixc(c,hex(0x5f9f6a),sstep(30,75,Math.hypot(x,z+8)));
    c=jitc(c,r,.06);C.push(c[0],c[1],c[2])}
  const nor=[];const id=(i,j)=>j*(N+1)+i;
  for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const a=id(Math.max(i-1,0),j),b=id(Math.min(i+1,N),j),c=id(i,Math.max(j-1,0)),d=id(i,Math.min(j+1,N));
    const dx=[P[b*3]-P[a*3],P[b*3+1]-P[a*3+1],P[b*3+2]-P[a*3+2]],dz=[P[d*3]-P[c*3],P[d*3+1]-P[c*3+1],P[d*3+2]-P[c*3+2]];let n=nrm(cross(dz,dx));if(n[1]<0)n=n.map(v=>-v);nor.push(...n)}
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=id(i,j),b=id(i+1,j),c=id(i+1,j+1),d=id(i,j+1);idx.push(a,b,c,a,c,d)}
  const n=(N+1)*(N+1),dd=new Float32Array(n*13);for(let k=0;k<n;k++){dd.set([P[k*3],P[k*3+1],P[k*3+2],nor[k*3],nor[k*3+1],nor[k*3+2],C[k*3],C[k*3+1],C[k*3+2],0,0,0,0],k*13)}
  return {dd,idx:new Uint16Array(idx)};
}
function makeSignTex(id){
  const cv=document.createElement('canvas'),w=id==='title'?640:540,h=id==='title'?368:200;cv.width=w;cv.height=h;const x=cv.getContext('2d');
  const gr=x.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#e3a865');gr.addColorStop(1,'#c98a45');x.fillStyle=gr;x.fillRect(0,0,w,h);
  x.globalAlpha=.16;x.strokeStyle='#7a4a1c';x.lineWidth=3;for(let i=0;i<14;i++){x.beginPath();const yy=h*(i+.5)/14+Math.sin(i)*4;x.moveTo(0,yy);x.bezierCurveTo(w*.3,yy+8,w*.6,yy-8,w,yy+3);x.stroke()}x.globalAlpha=1;
  x.strokeStyle='#8a5522';x.lineWidth=10;x.strokeRect(5,5,w-10,h-10);
  for(const [px,py] of [[24,24],[w-24,24],[24,h-24],[w-24,h-24]]){x.fillStyle='#6b3f15';x.beginPath();x.arc(px,py,7,0,7);x.fill()}
  x.direction='rtl';x.textAlign='center';x.textBaseline='middle';x.fillStyle='#1b2a5c';
  const F='Vazirmatn,Tahoma,"Segoe UI",sans-serif';
  if(id==='title'){x.font='900 118px '+F;x.fillText('مسیر',w/2,h*.31);x.fillText('نخبه شدن',w/2,h*.7)}
  else{x.font='900 104px '+F;x.fillText('شروع',w*.6,h*.54);const cx=w*.2,cy=h*.52;x.fillStyle='#ffffff';x.beginPath();x.arc(cx,cy,62,0,7);x.fill();const g2=x.createRadialGradient(cx-14,cy-16,6,cx,cy,54);g2.addColorStop(0,'#6ee36b');g2.addColorStop(1,'#1b9d36');x.fillStyle=g2;x.beginPath();x.arc(cx,cy,54,0,7);x.fill();x.fillStyle='#fff';x.beginPath();x.moveTo(cx-16,cy-26);x.lineTo(cx+28,cy);x.lineTo(cx-16,cy+26);x.closePath();x.fill()}
  return cv;
}
function setupGL(){
  const gl=st.gl,Wd=WORLD||buildWorld();
  st.pl=compile(gl,VS_LIT,FS_LIT);st.ps=compile(gl,VS_SPR,FS_SPR);st.pt=compile(gl,VS_TEX,FS_TEX);
  st.stat=litBuffer(gl,Wd.g);
  if(!st.terr)st.terr=terrainData(Wd.L);
  st.tb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,st.tb);gl.bufferData(gl.ARRAY_BUFFER,st.terr.dd,gl.STATIC_DRAW);
  st.ti=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,st.ti);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,st.terr.idx,gl.STATIC_DRAW);st.tn=st.terr.idx.length;
  st.bfly=litBuffer(gl,butterflyGeo());st.bird=litBuffer(gl,birdGeo());
  st.shd=sprBuffer(gl,Wd.shd);st.spr=sprBuffer(gl,Wd.spr);
  st.signs=Wd.signs.map(s=>{const uv=[[1,0],[0,0],[0,1],[1,1]];const q=s.q;const d=new Float32Array([...q[0],...uv[1],...q[1],...uv[0],...q[2],...uv[3],...q[0],...uv[1],...q[2],...uv[3],...q[3],...uv[2]]);
    const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,d,gl.STATIC_DRAW);return {b,id:s.id,tex:null}});
  st.signs.forEach(s=>{
    const make=()=>{if(!st||st.gl!==gl||gl.isContextLost())return;const cv=makeSignTex(s.id),t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      if(s.tex)gl.deleteTexture(s.tex);s.tex=t;st.dirty=true};
    make();
    if(document.fonts&&document.fonts.load){Promise.race([document.fonts.load('900 100px Vazirmatn'),new Promise(r=>setTimeout(r,2500))]).then(make).catch(()=>{})}
  });
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
}
function bindLit(gl,P,buf){gl.bindBuffer(gl.ARRAY_BUFFER,buf);const s=52;
  gl.enableVertexAttribArray(P.a.aP);gl.vertexAttribPointer(P.a.aP,3,gl.FLOAT,false,s,0);
  gl.enableVertexAttribArray(P.a.aN);gl.vertexAttribPointer(P.a.aN,3,gl.FLOAT,false,s,12);
  gl.enableVertexAttribArray(P.a.aC);gl.vertexAttribPointer(P.a.aC,3,gl.FLOAT,false,s,24);
  gl.enableVertexAttribArray(P.a.aA);gl.vertexAttribPointer(P.a.aA,4,gl.FLOAT,false,s,36)}
function disableAll(gl){const n=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);for(let i=0;i<Math.min(n,8);i++)gl.disableVertexAttribArray(i)}
const SUN=nrm([-.38,.82,.46]),FOG=hex(0xd6ebfb);
function camPos(c){const ce=Math.cos(c.ph);return [c.tx+c.R*ce*Math.sin(c.th),c.ty+c.R*Math.sin(c.ph),c.tz+c.R*ce*Math.cos(c.th)]}
function frame(now){
  if(!st)return;st.raf=requestAnimationFrame(frame);
  const gl=st.gl;if(gl.isContextLost())return;
  const dt=Math.min(.05,(now-(st.last||now))/1000);st.last=now;
  const c=st.cam;
  if(st.intro<1&&!st.rm){if(!st.t0)st.t0=now;st.intro=Math.min(1,(now-st.t0)/2800);const e=st.intro<.5?4*st.intro**3:1-Math.pow(-2*st.intro+2,3)/2;c.th=st.i0.th+(st.home.th-st.i0.th)*e;c.ph=st.i0.ph+(st.home.ph-st.i0.ph)*e;c.R=st.i0.R+(st.home.R-st.i0.R)*e;st.dirty=true}
  else if(st.fly){const f=st.fly;if(!f.t0)f.t0=now;const k=Math.min(1,(now-f.t0)/f.dur),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;for(const key in f.b)c[key]=f.a[key]+(f.b[key]-f.a[key])*e;st.dirty=true;if(k>=1)st.fly=null}
  else if(!st.drag&&(Math.abs(st.vth)>1e-4||Math.abs(st.vph)>1e-4)){c.th=clamp(c.th+st.vth,-.95,.95);c.ph=clamp(c.ph+st.vph,.2,.78);const k=Math.pow(.9,dt*60);st.vth*=k;st.vph*=k;st.dirty=true}
  if(st.rm&&!st.dirty)return;
  if(!st.rm)st.time+=dt;
  st.dirty=false;
  /* perf guard: drop resolution once if frames are slow */
  if(!st.rm&&st.intro>=1&&st.dpr>1){st.pf.push(dt);if(st.pf.length>=90){const avg=st.pf.reduce((a,b)=>a+b)/st.pf.length;st.pf=[];if(avg>1/34){st.dpr=Math.max(1,st.dpr-.5);resize()}}}
  const W=st.cv.width,H=st.cv.height;gl.viewport(0,0,W,H);
  gl.clearColor(FOG[0],FOG[1],FOG[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const eye=camPos(c),tgt=[c.tx,c.ty,c.tz],V=lookAt(eye,tgt,[0,1,0]),P=persp(st.fov,W/H,.5,1600),oy=st.inset*st.dpr/H;for(let k=0;k<4;k++)P[k*4+1]+=oy*P[k*4+3];const PV=m4(P,V);st.PV=PV;
  const t=st.time,ID=m4aff(I());
  const L=st.pl;gl.useProgram(L.p);
  gl.uniformMatrix4fv(L.u.uPV,false,PV);gl.uniformMatrix4fv(L.u.uM,false,ID);gl.uniform1f(L.u.uT,t);gl.uniform1f(L.u.uTf,t);gl.uniform3fv(L.u.uCam,eye);gl.uniform3fv(L.u.uSun,SUN);gl.uniform3fv(L.u.uFog,FOG);gl.uniform2f(L.u.uFogR,60,340);gl.uniform3f(L.u.uTint,1,1,1);gl.uniform1f(L.u.uPh,0);gl.uniform1f(L.u.uFlap,15);
  bindLit(gl,L,st.tb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,st.ti);gl.drawElements(gl.TRIANGLES,st.tn,gl.UNSIGNED_SHORT,0);
  bindLit(gl,L,st.stat.b);gl.drawArrays(gl.TRIANGLES,0,st.stat.n);
  /* butterflies */
  const bfl=[[2.6,4.6,1.6,1.2,[1,.45,.72],0],[-5.2,-1.2,1.4,1.7,[1,.7,.2],2],[5.4,-7.6,1.5,1.1,[.62,.5,1],4],[-2.6,8.8,1.7,1.3,[.4,.8,1],1]];
  bindLit(gl,L,st.bfly.b);
  for(const [cx,cz,rx,rz,col,ph] of bfl){const a=t*.45+ph,x=cx+Math.sin(a)*rx+Math.sin(a*2.3)*.4,z=cz+Math.cos(a*.8)*rz,y=heightAt(cx,cz,WORLD.L)+.9+Math.sin(a*3.1)*.3;
    const hd=Math.atan2(Math.cos(a)*rx,-Math.sin(a*.8)*rz*.8);gl.uniformMatrix4fv(L.u.uM,false,m4aff(ch(T(x,y,z),Ry(hd),Sc(.75))));gl.uniform3fv(L.u.uTint,col);gl.uniform1f(L.u.uPh,ph);gl.uniform1f(L.u.uFlap,15);gl.drawArrays(gl.TRIANGLES,0,st.bfly.n)}
  bindLit(gl,L,st.bird.b);
  for(let k=0;k<4;k++){const a=t*(.09+k*.015)+k*1.7,R=24+k*5,x=Math.cos(a)*R,z=-30+Math.sin(a)*R*.5,y=21+k*2.2+Math.sin(t*.6+k)*.8;
    gl.uniformMatrix4fv(L.u.uM,false,m4aff(ch(T(x,y,z),Ry(-a+Math.PI),Sc(1.1))));gl.uniform3f(L.u.uTint,1,1,1);gl.uniform1f(L.u.uPh,k);gl.uniform1f(L.u.uFlap,5);gl.drawArrays(gl.TRIANGLES,0,st.bird.n)}
  disableAll(gl);
  /* signs */
  const Tp=st.pt;gl.useProgram(Tp.p);gl.uniformMatrix4fv(Tp.u.uPV,false,PV);gl.uniform3fv(Tp.u.uCam,eye);gl.uniform3fv(Tp.u.uFog,FOG);gl.uniform2f(Tp.u.uFogR,60,340);gl.uniform1i(Tp.u.uTex,0);gl.activeTexture(gl.TEXTURE0);
  for(const s of st.signs){if(!s.tex)continue;gl.bindTexture(gl.TEXTURE_2D,s.tex);gl.bindBuffer(gl.ARRAY_BUFFER,s.b);gl.enableVertexAttribArray(Tp.a.aP);gl.vertexAttribPointer(Tp.a.aP,3,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(Tp.a.aUV);gl.vertexAttribPointer(Tp.a.aUV,2,gl.FLOAT,false,20,12);gl.drawArrays(gl.TRIANGLES,0,6)}
  disableAll(gl);
  /* sprites */
  const Sp=st.ps;gl.useProgram(Sp.p);gl.uniformMatrix4fv(Sp.u.uPV,false,PV);gl.uniform3f(Sp.u.uR,V[0],V[4],V[8]);gl.uniform3f(Sp.u.uU,V[1],V[5],V[9]);gl.uniform1f(Sp.u.uT,t);gl.uniform1f(Sp.u.uTf,t);
  gl.enable(gl.BLEND);gl.depthMask(false);
  const sb=(b)=>{gl.bindBuffer(gl.ARRAY_BUFFER,b);const s=48;gl.enableVertexAttribArray(Sp.a.aC);gl.vertexAttribPointer(Sp.a.aC,3,gl.FLOAT,false,s,0);gl.enableVertexAttribArray(Sp.a.aQ);gl.vertexAttribPointer(Sp.a.aQ,2,gl.FLOAT,false,s,12);gl.enableVertexAttribArray(Sp.a.aK);gl.vertexAttribPointer(Sp.a.aK,4,gl.FLOAT,false,s,20);gl.enableVertexAttribArray(Sp.a.aCol);gl.vertexAttribPointer(Sp.a.aCol,3,gl.FLOAT,false,s,36)};
  gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);sb(st.shd.b);gl.drawArrays(gl.TRIANGLES,0,st.shd.n);gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.blendFunc(gl.ONE,gl.ONE);sb(st.spr.b);gl.drawArrays(gl.TRIANGLES,0,st.spr.n);
  gl.depthMask(true);gl.disable(gl.BLEND);disableAll(gl);
  placeAnchors();
}
function placeAnchors(){
  const PV=st.PV,W=st.host.clientWidth,H=st.host.clientHeight;
  for(const el of st.anc){const p=WORLD.anchors[el.dataset.anc];if(!p)continue;
    const x=PV[0]*p[0]+PV[4]*p[1]+PV[8]*p[2]+PV[12],y=PV[1]*p[0]+PV[5]*p[1]+PV[9]*p[2]+PV[13],w=PV[3]*p[0]+PV[7]*p[1]+PV[11]*p[2]+PV[15];
    if(w<=.1){el.style.visibility='hidden';continue}
    const sx=(x/w*.5+.5)*W,sy=(1-(y/w*.5+.5))*H,out=sx<-40||sx>W+40||sy<-40||sy>H+40;
    el.style.visibility=out?'hidden':'visible';el.style.transform=`translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`}
}
function resize(){
  if(!st)return;const w=st.host.clientWidth,h=st.host.clientHeight;if(!w||!h)return;
  st.cv.width=Math.round(w*st.dpr);st.cv.height=Math.round(h*st.dpr);
  const asp=w/h;st.fov=asp<1?.88:.7;st.home.R=asp<.6?31.5:asp<1?28:23;
  if(st.intro>=1&&!st.userZoom)st.cam.R=st.home.R;
  st.dirty=true;
}
function onDown(e){if(!st)return;st.fly=null;st.cv.setPointerCapture&&st.cv.setPointerCapture(e.pointerId);st.ptr.set(e.pointerId,[e.clientX,e.clientY]);st.drag=true;st.vth=st.vph=0;if(st.intro<1){st.intro=1}st.onInteract&&st.onInteract()}
function onMove(e){if(!st||!st.ptr.has(e.pointerId))return;const prev=st.ptr.get(e.pointerId);const c=st.cam;
  if(st.ptr.size===1){const dx=e.clientX-prev[0],dy=e.clientY-prev[1];const dth=-dx*.0055,dph=dy*.0035;c.th=clamp(c.th+dth,-.95,.95);c.ph=clamp(c.ph+dph,.2,.78);st.vth=dth;st.vph=dph}
  else if(st.ptr.size===2){const ids=[...st.ptr.keys()],o=st.ptr.get(ids[0]===e.pointerId?ids[1]:ids[0]);const d0=Math.hypot(prev[0]-o[0],prev[1]-o[1]),d1=Math.hypot(e.clientX-o[0],e.clientY-o[1]);if(d0>0){c.R=clamp(c.R*d0/d1,12,st.home.R*1.3);st.userZoom=true}}
  st.ptr.set(e.pointerId,[e.clientX,e.clientY]);st.dirty=true}
function onUp(e){if(!st)return;st.ptr.delete(e.pointerId);if(!st.ptr.size)st.drag=false;if(st.rm){st.vth=st.vph=0}}
function onWheel(e){if(!st)return;e.preventDefault();st.fly=null;st.cam.R=clamp(st.cam.R*(1+e.deltaY*.001),12,st.home.R*1.3);st.userZoom=true;st.intro=1;st.dirty=true}
function onKey(e){if(!st)return;st.fly=null;const c=st.cam,k={ArrowLeft:[.08,0],ArrowRight:[-.08,0],ArrowUp:[0,.05],ArrowDown:[0,-.05]}[e.key];if(!k)return;e.preventDefault();st.intro=1;c.th=clamp(c.th+k[0],-.95,.95);c.ph=clamp(c.ph+k[1],.2,.78);st.dirty=true}
function lost(e){e.preventDefault();if(st)cancelAnimationFrame(st.raf)}
function restored(){if(!st)return;try{setupGL();resize();st.last=0;st.raf=requestAnimationFrame(frame)}catch(err){fail(err)}}
function fail(err){if(st&&st.onFail)st.onFail(err);destroy()}
function init(host,opt={}){
  destroy();
  STAGE=Math.max(0,Math.min(7,Number(opt.level||1)-1));WORLD=null;
  const cv=host.querySelector('canvas');let gl=null;
  try{gl=cv.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'})||cv.getContext('experimental-webgl')}catch(e){}
  if(!gl){opt.onFail&&opt.onFail(new Error('no webgl'));return false}
  const home={th:-.04,ph:.29,R:31.5};
  st={gl,cv,host,inset:opt.bottomInset||0,rm:!!opt.reduced,onInteract:opt.onInteract,onFail:opt.onFail,dpr:Math.min(window.devicePixelRatio||1,2),fov:.88,home,tgt0:{tx:.2,ty:5.6,tz:-3.2},cam:{...home,tx:.2,ty:5.6,tz:-3.2},
    i0:{th:-.6,ph:.66,R:46},intro:opt.reduced?1:0,time:opt.reduced?4:0,vth:0,vph:0,ptr:new Map(),drag:false,dirty:true,pf:[],anc:[...host.querySelectorAll('[data-anc]')],raf:0,last:0};
  try{setupGL()}catch(err){st=null;opt.onFail&&opt.onFail(err);return false}
  st.ro=new ResizeObserver(resize);st.ro.observe(host);resize();
  if(!st.rm){st.cam.th=st.i0.th;st.cam.ph=st.i0.ph;st.cam.R=st.i0.R}
  cv.addEventListener('pointerdown',onDown);cv.addEventListener('pointermove',onMove);cv.addEventListener('pointerup',onUp);cv.addEventListener('pointercancel',onUp);
  cv.addEventListener('wheel',onWheel,{passive:false});cv.addEventListener('keydown',onKey);cv.addEventListener('webglcontextlost',lost);cv.addEventListener('webglcontextrestored',restored);
  st.raf=requestAnimationFrame(frame);
  return true;
}
function destroy(){
  if(!st)return;const s=st;st=null;cancelAnimationFrame(s.raf);s.ro&&s.ro.disconnect();
  const cv=s.cv;['pointerdown','pointermove','pointerup','pointercancel'].forEach((n,i)=>cv.removeEventListener(n,[onDown,onMove,onUp,onUp][i]));cv.removeEventListener('wheel',onWheel);cv.removeEventListener('keydown',onKey);cv.removeEventListener('webglcontextlost',lost);cv.removeEventListener('webglcontextrestored',restored);
  const gl=s.gl;try{if(!gl.isContextLost()){[s.stat,s.bfly,s.bird,s.shd,s.spr].forEach(b=>b&&gl.deleteBuffer(b.b));gl.deleteBuffer(s.tb);gl.deleteBuffer(s.ti);(s.signs||[]).forEach(x=>{gl.deleteBuffer(x.b);x.tex&&gl.deleteTexture(x.tex)});[s.pl,s.ps,s.pt].forEach(p=>p&&gl.deleteProgram(p.p));const ext=gl.getExtension('WEBGL_lose_context');ext&&ext.loseContext()}}catch(e){}
}
function flyTo(to,dur){if(!st)return;if(st.rm){Object.assign(st.cam,to);st.dirty=true;return}st.intro=1;st.vth=st.vph=0;const c=st.cam;st.fly={a:{th:c.th,ph:c.ph,R:c.R,tx:c.tx,ty:c.ty,tz:c.tz},b:{...st.cam,...to},t0:0,dur:dur||950}}
function focus(name){if(!st||!WORLD)return;const p=WORLD.anchors[name];if(!p)return;st.userZoom=true;flyTo({tx:p[0],ty:p[1]+.6,tz:p[2],R:15,ph:.4,th:clamp(st.cam.th,-.5,.5)})}
function debugCam(th,ph,R){if(!st)return;st.intro=1;Object.assign(st.cam,{th,ph,R});st.dirty=true}
function recenter(){if(!st)return;st.userZoom=false;flyTo({...st.home,...st.tgt0})}
return {init,destroy,recenter,focus,debugCam,get active(){return !!st}};
})();
