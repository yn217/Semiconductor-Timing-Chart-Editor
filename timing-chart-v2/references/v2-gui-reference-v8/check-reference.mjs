import fs from 'node:fs';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const failures=[];
for(const s of ['Signals / Groups','Signal / Annotation','Time Scale:','Reference:','Minimap']) if(!html.includes(s)) failures.push('missing '+s);
if((html.match(/class="mini-btn eye on"/g)||[]).length<10) failures.push('missing left visibility eye controls');
if((html.match(/class="comment-icon"/g)||[]).length<6) failures.push('missing comment SVG icons');
if((html.match(/class="chev-icon"/g)||[]).length<3) failures.push('missing SVG chevrons');
if(!css.includes('--role-w:61px')||!css.includes('--signal-w:148px')) failures.push('golden center columns not tokenized');
if((html.match(/class=\"label-ruler-spacer\"/g)||[]).length!==2) failures.push('Role/Signal ruler spacers must be exactly 2');
if(!css.includes('.label-ruler-spacer')) failures.push('missing label-ruler-spacer CSS');
if(!html.includes('display-two-row')) failures.push('v7 Display two-row missing');
if((html.match(/class="label-ruler-spacer"/g)||[]).length!==2) failures.push('Role/Signal ruler spacers must remain exactly 2');
if(failures.length){console.error('REFERENCE V5 CHECK FAILED');failures.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('REFERENCE V5 CHECK PASS');
console.log('eyes:',(html.match(/class="mini-btn eye on"/g)||[]).length);
console.log('comments:',(html.match(/class="comment-icon"/g)||[]).length);
