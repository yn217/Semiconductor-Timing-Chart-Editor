import fs from 'node:fs';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const fail=[];
for(const x of ['display-two-row','display-grid-control','display-snap-control','display-ruler-control','display-minimap-control'])
  if(!html.includes(x)) fail.push('missing '+x);
if(!html.includes('class="checkmark-box">✓</span><span>Snap')) fail.push('Snap checkbox-style missing');
if(!css.includes('.display-grid-control{grid-column:1;grid-row:1}')) fail.push('Grid must be top-left');
if(!css.includes('.display-snap-control{grid-column:1;grid-row:2}')) fail.push('Snap must be below Grid');
for(const x of ['Cycle<br>Insert','Cycle<br>Delete','N Cycle<br>Insert','N Cycle<br>Delete','Align<br>Interval','Auto<br>Layout','Zoom<br>Out','Zoom<br>In','Fit<br>All'])
  if(!html.includes(x)) fail.push('missing golden line-break label '+x);
if((html.match(/class="ribbon-icon"/g)||[]).length<24) fail.push('not enough inline ribbon icons');
if(fail.length){console.error('RIBBON V7 CHECK FAILED');fail.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('RIBBON V7 CHECK PASS');
console.log('Grid/Snap 2-row: PASS');
console.log('Golden icon family: PASS');
