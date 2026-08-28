import fs from 'node:fs';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const fail=[];

for(const label of ['Duplicate','Import...','Export...','Preview']){
  const re=new RegExp(`<button class="small-btn bottom-action">[\\s\\S]*?<span>${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}<\\/span><\\/button>`);
  if(!re.test(html)) fail.push('missing SVG bottom action '+label);
}
if((html.match(/class="bottom-action-icon"/g)||[]).length < 5) fail.push('expected at least 5 bottom inline SVG icons');
for(const glyph of ['▣','⇩','⇧','◉']){
  if(html.includes(`>${glyph} `)) fail.push('forbidden bottom glyph remains '+glyph);
}
for(const token of ['--role-badge-io-w:28px','--role-badge-wire-w:42px','--comment-badge-w:24px']){
  if(!css.includes(token)) fail.push('missing shared badge token '+token);
}
if(!css.includes('.role.ri,.role.ro')) fail.push('i/o shared width rule missing');
if(!css.includes('.role.rw')) fail.push('wire shared width rule missing');

if(fail.length){
  console.error('REFERENCE V8 CHECK FAILED');
  fail.forEach(x=>console.error(' - '+x));
  process.exit(1);
}
console.log('REFERENCE V8 CHECK PASS');
console.log('Bottom SVG actions: PASS');
console.log('Shared role badge widths: PASS');
