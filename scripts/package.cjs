'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createZip } = require('../src/zip');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'build.cjs')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--test', ...fs.readdirSync(path.join(root, 'tests')).filter(n => n.endsWith('.test.cjs')).map(n => path.join(root, 'tests', n))], { stdio: 'inherit' });
execFileSync(process.execPath,[path.join(__dirname,'verify.cjs')],{stdio:'inherit'});
const items = [];
const allowedRoot = new Set(['src','dist','scripts','tests','.gitignore','.gitattributes','manifest.json','package.json','README.md','WINDOWS-INSTALL-126.6.8.md','TEST-REPORT.md','CHANGELOG.md','LICENSE','build.cmd','test.cmd','BUILD-VERIFICATION.json']);
function collect(dir) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (!dir && !allowedRoot.has(e.name)) continue;
    if (['node_modules','.git','artifacts','outputs','tmp','temp','work','.cache','.vscode','.idea'].includes(e.name)) continue;
    if (/^\.env(?:\.|$)|\.(?:key|pem|p12|pfx|tmp|log|bak|zip)$|library-identity\.json$/.test(e.name)) continue;
    if (/^(?:auth\.json|credentials.*\.json|secrets.*\.json|tokens?.*\.json|id_rsa.*|id_ed25519.*)$/.test(e.name)) continue;
    const relative = path.posix.join(dir, e.name);
    if (e.isDirectory()) collect(relative);
    else items.push({ path: 'figma-to-codex-exporter/' + relative, bytes: fs.readFileSync(path.join(root, relative)) });
  }
}
collect('');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const dest = path.resolve(root, '..', 'outputs', 'figma-to-codex-exporter-v' + version + '.zip');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, createZip(items));
console.log('Package: ' + dest);
