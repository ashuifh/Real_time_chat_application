import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

async function findJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? findJavaScriptFiles(path) : path.endsWith('.js') ? [path] : [];
  }));
  return files.flat();
}

const files = await findJavaScriptFiles('src');
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
else console.log(`Syntax OK: ${files.length} JavaScript files`);