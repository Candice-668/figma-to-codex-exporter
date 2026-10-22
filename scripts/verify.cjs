'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const references=['manifest.json',manifest.main,manifest.ui,'src/exporter.js','src/batch.js','src/handoff.js','src/main.js','src/ui.html','src/ui.js','src/zip.js','scripts/build.cjs','scripts/package.cjs','scripts/verify.cjs','build.cmd','test.cmd','README.md','WINDOWS-INSTALL-126.6.8.md','TEST-REPORT.md','CHANGELOG.md','LICENSE'];
const files=references.map(relative=>{
  const absolute=path.resolve(root,relative);assert.ok(absolute.startsWith(root+path.sep),'Path must stay in project');assert.ok(fs.statSync(absolute).isFile(),relative+' missing');
  const bytes=fs.readFileSync(absolute);return {relative,absolute,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
});
new vm.Script(fs.readFileSync(path.join(root,manifest.main),'utf8'));
const html=fs.readFileSync(path.join(root,manifest.ui),'utf8');
assert.doesNotMatch(html,/<(?:script|link|iframe|img)\b[^>]*(?:src|href)\s*=/i,'Runtime UI must be self-contained');
assert.doesNotMatch(html,/\/\* (ZIP|UI|HANDOFF)_MODULE \*\//);
assert.equal(manifest.name,'Figma to Codex Exporter');assert.deepEqual(manifest.networkAccess.allowedDomains,['none']);
const result={verifiedAt:new Date().toISOString(),projectRoot:root,manifestPath:path.join(root,'manifest.json'),built:true,externalRuntimeDependencies:0,files};
fs.writeFileSync(path.join(root,'BUILD-VERIFICATION.json'),JSON.stringify(result,null,2)+'\n');
console.log('Verified '+files.length+' files; manifest main/ui exist; self-contained runtime; BUILD-VERIFICATION.json written.');
