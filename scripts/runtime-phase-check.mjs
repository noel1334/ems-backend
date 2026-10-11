import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const required = [
  'prisma/schema.prisma',
  'prisma/seed.js',
  'src/server.js',
  'src/app.js',
  'src/route/index.js',
  'docker-compose.yml',
  '.env.test.example',
];

for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) {
    console.error(`Missing required runtime file: ${file}`);
    process.exit(1);
  }
}

const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) jsFiles.push(full);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'scripts'));
let failures = 0;
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    console.error(`Syntax failure: ${path.relative(root, file)}\n${result.stderr}`);
  }
}
if (failures) process.exit(1);

const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]);
const enums = [...schema.matchAll(/^enum\s+(\w+)/gm)].map((m) => m[1]);
if (models.length < 1 || enums.length < 1) {
  console.error('Prisma schema appears incomplete.');
  process.exit(1);
}

console.log(`Runtime phase static check OK: ${jsFiles.length} JS/MJS files, ${models.length} Prisma models, ${enums.length} enums.`);
console.log('Database-dependent checks remain pending until PostgreSQL and npm dependencies are available.');
