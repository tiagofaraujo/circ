import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const preview = process.argv.includes('--preview');
const config = JSON.parse(fs.readFileSync('src/data/mediaCenter.json'));
const output = preview ? '.media-preview' : 'build';
const sourceFor = (doc, file) => path.join(doc.status === 'published' ? 'media-published' : 'private-data/media', file.name);
const graphicAssets = [
  {name:'Cartaz_2027_RGB-3000.jpg', kind:'jpeg'},
  {name:'CIRC2027_LOGO_VETORIAL.pdf', kind:'pdf'},
  {name:'Digitial_1920x1080-TORRE.jpg', kind:'jpeg'},
  {name:'Digitial_1350x1080-TORRE.jpg', kind:'jpeg'},
  {name:'Digitial_1080x1350-TORRE.jpg', kind:'jpeg'},
  {name:'Digitial_1080x1920-TORRE.jpg', kind:'jpeg'},
];
// Always remove generated material before building. Draft bytes never enter public/.
fs.rmSync('public/media-files', {recursive:true, force:true});
fs.rmSync(output, {recursive:true, force:true});
const selected = config.documents.filter(d => preview || (config.published && d.status === 'published'));
for (const doc of selected) for (const [ext, file] of Object.entries(doc.files)) {
  if (!/^[A-Za-z0-9_-]+\.(pdf|docx|zip)$/.test(file.name)) throw new Error('Invalid media filename');
  const bytes = fs.readFileSync(sourceFor(doc, file));
  if (bytes.length !== file.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('Update verified metadata for ' + file.name);
  if (ext === 'pdf' ? bytes.subarray(0,5).toString() !== '%PDF-' : bytes.subarray(0,4).toString('hex') !== '504b0304') throw new Error('Invalid file format: ' + file.name);
}
if (!preview) {
  for (const asset of graphicAssets) {
    if (!/^[A-Za-z0-9_-]+\.(jpg|pdf)$/.test(asset.name)) throw new Error('Invalid graphic asset filename');
    const source = path.join('media-assets', asset.name);
    if (!fs.existsSync(source)) throw new Error('Missing graphic asset: ' + asset.name);
    const bytes = fs.readFileSync(source);
    const valid = asset.kind === 'jpeg'
      ? bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.subarray(0,5).toString() === '%PDF-';
    if (!valid) throw new Error('Invalid graphic asset format: ' + asset.name);
  }
}
const result = spawnSync(process.execPath, ['node_modules/react-scripts/bin/react-scripts.js', 'build'], {stdio:'inherit', env:{...process.env, BUILD_PATH:output, REACT_APP_MEDIA_PREVIEW:String(preview), GENERATE_SOURCEMAP:'false'}});
if (result.status !== 0) process.exit(result.status || 1);
for (const doc of selected) for (const file of Object.values(doc.files)) {
 fs.mkdirSync(path.join(output,'media-files'), {recursive:true});
 fs.copyFileSync(sourceFor(doc, file),path.join(output,'media-files',file.name));
}
if (!preview) {
  fs.mkdirSync(path.join(output,'media-assets'), {recursive:true});
  for (const asset of graphicAssets) fs.copyFileSync(path.join('media-assets', asset.name), path.join(output,'media-assets',asset.name));
}
console.log(preview
  ? 'PRIVATE LOCAL PREVIEW ONLY — .media-preview must not be deployed.'
  : 'Production build: published press documents and approved graphic assets included.');
