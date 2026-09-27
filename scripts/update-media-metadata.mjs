import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const manifest=path.join(root,'src/data/mediaCenter.json');
const data=JSON.parse(fs.readFileSync(manifest));
for(const doc of data.documents)for(const file of Object.values(doc.files)){
 if (!/^[A-Za-z0-9_-]+\.(pdf|docx)$/.test(file.name)) throw new Error('Invalid filename');
 const bytes=fs.readFileSync(path.join(root,'private-data/media',file.name));
 file.bytes=bytes.length;file.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
}
fs.writeFileSync(manifest,JSON.stringify(data,null,2)+'\n');
console.log('Actual sizes and SHA-256 updated. Editorial publication states unchanged.');
