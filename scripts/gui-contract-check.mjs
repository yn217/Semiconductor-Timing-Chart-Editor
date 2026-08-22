import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('gui-mockup/index.html', 'utf8');
const css = fs.readFileSync('gui-mockup/styles.css', 'utf8');
const forbidden = ['tabs-top', 'rg clip', 'rg edit', 'rg signals', 'rg order', 'rg layout', 'rg view', 'rg display', 'jsonbar', 'Production Editor'];
for (const token of forbidden) assert.equal(html.includes(token), false, `Legacy GUI token remains: ${token}`);
for (const token of ['ribbon-tabs', 'ribbon', 'left-panel', 'center', 'bottom', 'inspector', 'bottom-tabs']) assert.ok(html.includes(token), `Locked GUI selector missing: ${token}`);
assert.match(html, /data-mode="cycle"/);
assert.match(html, /data-mode="transaction"/);
assert.match(html, /data-mode="split"/);
assert.match(css, /grid-template-columns/);
assert.equal(fs.existsSync('gui-mockup/production-overrides.css'), false);
console.log('Locked GUI DOM contract passed.');
