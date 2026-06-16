const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, 'functions', 'api', '[[path]].js');
let code = fs.readFileSync(f, 'utf8');
const fullKey = 'eyJhbG...i-54';
code = code.replace(/SUPA_ANON_KEY \|\| '.*?'/g, `SUPA_ANON_KEY || '${fullKey}'`);
code = code.replace(/R2_BASE_URL \|\| '.*?'/g, `R2_BASE_URL || 'https://pub-4e5938738d134acea00813d130fc0d3f.r2.dev'`);
fs.writeFileSync(f, code, 'utf8');
console.log('Done');
