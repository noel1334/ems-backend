import fs from 'node:fs';
import path from 'node:path';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map(m => m[1]);
const enums = [...schema.matchAll(/^enum\s+(\w+)/gm)].map(m => m[1]);
const unique = (xs) => new Set(xs).size === xs.length;
if (!unique(models) || !unique(enums)) throw new Error('Duplicate Prisma model/enum names detected');
if ((schema.match(/{/g) || []).length !== (schema.match(/}/g) || []).length) throw new Error('Unbalanced Prisma schema braces');
const relationTargets = [...schema.matchAll(/\b\w+\s+([A-Z]\w+)(?:\[\])?\s+@relation\(/g)].map(m => m[1]);
const missing = [...new Set(relationTargets)].filter(x => !models.includes(x));
if (missing.length) throw new Error(`Missing Prisma relation targets: ${missing.join(', ')}`);
const empty = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (p.endsWith('.js') && st.size === 0) empty.push(p);
  }
}
walk('src');
if (empty.length) throw new Error(`Empty source files: ${empty.join(', ')}`);
console.log(`Stage 17 static check OK: ${models.length} models, ${enums.length} enums, ${empty.length} empty JS files.`);
