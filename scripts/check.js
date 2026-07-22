const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const directories = ['', 'lib', 'dashboard', 'counter', 'scripts'];
const files = [];

for (const directory of directories) {
  const absolute = path.join(root, directory);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(path.join(absolute, entry.name));
  }
}

files.sort();
for (const file of files) {
  const relative = path.relative(root, file);
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Syntaxe invalide : ${relative}`);
    process.exit(result.status || 1);
  }
}

console.log(`${files.length} fichiers JavaScript vérifiés.`);
