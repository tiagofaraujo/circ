import { writeFile } from 'node:fs/promises';
import webpush from 'web-push';

// Never prints the private key; refuses to overwrite an existing pair.
const path = '.push-secrets.json';
const pair = webpush.generateVAPIDKeys();
await writeFile(path, JSON.stringify({ PUSH_VAPID_PUBLIC_KEY: pair.publicKey, PUSH_VAPID_PRIVATE_KEY: pair.privateKey }, null, 2) + '\n',
  { flag: 'wx', mode: 0o600 });
console.log('Chaves guardadas em .push-secrets.json. Importe-as como secrets do Worker circ; não publique nem envie este ficheiro.');
