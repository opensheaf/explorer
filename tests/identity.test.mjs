// Generated from literate/71-tests-identity.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyEd25519, strictlyAcceptable, base32, sha256, utf8, unbase64, hex } from '../app/crypto.js';
import { nameOf, algorithm, isNameOf, readGenesis, didKey, didKeyPublic, keyDigest, keyId, jcs, parseSheaf,
         orcidValid, keeperValid } from '../app/names.js';
import { firstVersion, KeyLog, Version, keyRules, ownerObject, jsonOrNull } from '../app/owners.js';
import { message, fileName, judge, lineStatuses, latestSigned, readSignatureFile, GOOD, UNCHECKED, INVALID }
  from '../app/signatures.js';
import { Http } from '../app/http.js';
import { Archive } from '../app/archive.js';
import { diskFetch, ORIGIN, idOf } from './disk.mjs';

const A = '56wo6cdpjsxk7ddgnqfp2quipfghukhtmvjuahvwzko7m4tkz3pa';
const N = 'zzgdggwlldcrw4bdeuvntiaobtw2kge6bc4go737pfekhfc5oz4q';
const N1 = 'aajozkubvmxu37pbu2lumdl37llv4ntkazd6j2es54zn23fkiknb';
const KL1 = 'afaabe7b9489bc408ecbb20e8477a7eeb4e8a0ebde0dc15e32d30be17d922207504953e3e52101015f770844449c8382c4c4d9bec472a908ed47200efaef1220';
const KL2 = '7673bfae6ba91f6e9acf862635649efde7b6af0e1a787f6dc2cb2f2a583d5d4fab7bf236f7284582a4894aebef2769eacbf69d9036f1ecd4f89c07bc31313f84';
const KL3 = 'd006b40d988e88c16cfe7d83d81c5b8a0cb318daad1a78180566568c2553f4b7ef7de1d3ebadd785fba94bb3648e70d6a8f8b40cb8a7cfdd913fc76ba959ce7e';
const D2 = 'e3e1319055b967af645713c3baa4dc1974eb8ce02f6b2591bbcce55b068e7a98df54dfa8ab2fd8996d27a2b31df8bee814281d681187014eaa0316f048edbb25';
const K1 = 'did:key:z6MksKLDefPeXwhL6SJCLqpW1dGZcvBjfsv9mxGCFpMkMuVW';
const K3 = 'did:key:z6MkugKqPPkysjyartSzszBbMh8fVhENmqGXvddtD8DDvThn';
const R1 = 'did:key:z6Mkh5i2epG9LsWNnYbBHG7ctEiNLZPjsBNXxNUcsaYgEtNm';
const R4 = 'did:key:z6MksaMy3cmXbnUKqzGv18xhbBreY6berNYVtTZyDrYRb1Hn';
const OWNER_ID = `sheaf:${A}:${A}`;
const PAPER_ID = `sheaf:${N}:${A}`;

const GENESIS_A = utf8(`{
  "format": "opensheaf-genesis/0.2",
  "kind": "owner",
  "created": "2026-03-01T17:40:00Z",
  "nonce": "1b4d9964664d9825076eb8558af61162",
  "keys": [
    "${K1}"
  ],
  "threshold": 1,
  "next": [
    "oxthfb6b4q3sqathmcpnciqggfxlr3aekgfg2tpm2lgrm2qnalha",
    "h6k4k6c5u4dusj4szwimmaa5cozrwu4jo45xa6erpjggpyvla6vq",
    "lnaifwjnrmhyjj3x7uikmzxznxfbgydi25iftupd2ktobmnpaklq"
  ],
  "nextThreshold": 2,
  "keeper": [
    "https://orcid.org/0000-0002-1234-5677"
  ],
  "extensions": {
    "https://opensheaf.org/opensheaf-timestamps-0.2": {
      "timestampAuthorities": [
        "5b4e3f0c9d2a7e18c6f4b0a39d7e2c51f8a6b3d09e4c7a12f5b8d6e3a0c9f147"
      ]
    }
  }
}
`);

const GENESIS_N = utf8(`{
  "format": "opensheaf-genesis/0.2",
  "kind": "document",
  "created": "2026-03-02T09:14:00Z",
  "originator": "${A}",
  "nonce": "6f65cd32058c16d6d78b05011772ff1d"
}
`);

const SIGNATURES = [
  { object: OWNER_ID, version: 'v2', inventorySha512: KL2, key: R1, keyLog: `sheaf:${A}/v1?sha512=${KL1}`,
    signature: 'MyYYLDn6FPmfVz478eKdcQF2FOkRTL8/ZV9qV35/PuC5u09ZYwDVxunX3S4Z1jWHICWsxgA+/L3MW49O0Z7vCA==', file: 'oxthfb6b4q3sqath' },
  { object: PAPER_ID, version: 'v2', inventorySha512: D2, key: K3, keyLog: `sheaf:${A}/v2?sha512=${KL2}`,
    signature: '0j2Xy5fRv+1ajlCCkmCXAOZj1U8CUeiYA1jP08kJevQH27QnXHLZ7TeF+WwxzYB+ad2OepksXgSCzP1KoCEYCg==', file: '4hz7zgsiazl6hx7i' },
  { object: OWNER_ID, version: 'v3', inventorySha512: KL3, key: R4, keyLog: `sheaf:${A}/v2?sha512=${KL2}`,
    signature: 'lAQKAGCR6HxrUX+mv5DbqOFehbfo1zlLtYVPrNmyG+Wq5p0RuWEC+PyL7c0amQ+lRc0EKgJpfY5eRAt9oGU8Dw==', file: 'j77iavvdclktxkwm' },
];

function signatureFile(s, change = {}) {
  return utf8(JSON.stringify({ format: 'opensheaf-signature/0.2', object: s.object, version: s.version,
    inventorySha512: s.inventorySha512, signer: A, key: s.key, keyLog: s.keyLog, signature: s.signature, ...change }));
}

test('the names of appendix C (sections 5.2 and C.1, C.2)', async () => {
  assert.equal(await nameOf(GENESIS_A), A);
  assert.equal(await nameOf(GENESIS_N), N);
  assert.equal(await nameOf(GENESIS_N, 1), N1);
  const all = await Promise.all(Array.from({ length: 16 }, (_, k) => nameOf(GENESIS_N, k)));
  assert.equal(new Set(all).size, 16);
  assert.deepEqual(all.map(algorithm), Array.from({ length: 16 }, (_, k) => k));
  for (const n of all) assert.ok(await isNameOf(n, GENESIS_N));
  assert.ok(!await isNameOf(A, GENESIS_N));
  await assert.rejects(nameOf(GENESIS_N, 16), /numbered 0 to 15/);
  assert.equal((await readGenesis(GENESIS_A)).keeper[0], 'https://orcid.org/0000-0002-1234-5677');
});

test('genesis records that are not', async () => {
  const g = JSON.parse(new TextDecoder().decode(GENESIS_A));
  const bad = async (change) => readGenesis(utf8(JSON.stringify({ ...g, ...change })));
  await assert.rejects(bad({ threshold: 2 }), /threshold 2 exceeds the 1 item\(s\) it counts \(rule 1\)/);
  await assert.rejects(bad({ next: [await keyDigest(K1)] }), /both a current key and a rotation key/);
  await assert.rejects(bad({ keeper: ['https://orcid.org/0000-0002-1234-5678'] }), /keeper must be/);
  await assert.rejects(bad({ originator: A }), /fields not allowed in a genesis record of kind owner: originator/);
  await assert.rejects(readGenesis(new Uint8Array([0xef, 0xbb, 0xbf, ...GENESIS_N])), /byte order mark/);
});

test('did:key URIs and the digests of keys (sections 6.1 and 7.2)', async () => {
  const public3 = didKeyPublic(K3);
  assert.equal(public3.length, 32);
  assert.equal(didKey(public3), K3);
  assert.throws(() => didKeyPublic('did:key:z6MkugKqPPkysjyartSzszBbMh8fVhENmqGXvddtD8DDvTh'), /Ed25519|canonical/);
  assert.equal(await keyId(K3), '4hz7zgsiazl6hx7i');
  assert.equal(await fileName(K3), 'signature-4hz7zgsiazl6hx7i.json');
  assert.equal(await keyDigest(R1), (await readGenesis(GENESIS_A)).next.find((d) => d.startsWith('oxthfb6b4q3sqath')));
  assert.equal(base32(await sha256(utf8(R4))), 'j77iavvdclktxkwmwefs7lw6fisdi7lqphwe33g4nboea35t2zga');
});

test('canonical JSON (RFC 8785)', () => {
  assert.equal(jcs({ b: [1, 'é', null], a: { d: true, c: '\u0001"' } }), '{"a":{"c":"\\u0001\\"","d":true},"b":[1,"é",null]}');
  assert.equal(jcs({ 'é': 1, z: 2, '😀': 3 }), '{"z":2,"é":1,"😀":3}');
  assert.throws(() => jcs({ x: 0.5 }), /fractional/);
  assert.throws(() => jcs('\ud800'), /lone surrogate/);
  assert.equal(jcs(ownerObject(A, KL1)),
    `{"format":"opensheaf-object/0.2","kind":"owner","name":"${A}","owner":"${A}","previous":"${KL1}","specification":"0.2","status":"active"}`);
});

test('keepers: ORCID check digits and domains (section 6.6)', () => {
  assert.ok(orcidValid('https://orcid.org/0000-0002-1234-5677'));
  assert.ok(!orcidValid('https://orcid.org/0000-0002-1234-5678'));
  assert.ok(orcidValid('0000-0002-1694-006X'));
  assert.ok(orcidValid('https://orcid.org/0000-0002-1825-0097'));
  assert.ok(keeperValid('https://journal.example.org/'));
  assert.ok(!keeperValid('http://journal.example.org/'));
});

test('sheaf: URIs (sections 12.1, 12.2 and C.7)', () => {
  const J = 'tqr6lchnd2vk7ezskdc5zdxpaidpsiuduo5sqhiis3i55iautdka';
  const at = 'at=https%3A%2F%2Fmgubi.org%2Fpapers%2F';
  for (const text of [`sheaf:${N}`, `sheaf:${N}/v2`, `sheaf:${N}/v2?sha512=${D2}`, `sheaf:${N}/v2?sha512=${D2}&${at}`,
                      `sheaf:${N}:${J}/v2`, `sheaf:${N}:*`, `sheaf:${A}`, `sheaf:${A}/v2?sha512=${KL2}`]) {
    assert.equal(String(parseSheaf(text)), text);
  }
  const u = parseSheaf(`sheaf:${N}/v2?sha512=${D2}&${at}`);
  assert.deepEqual([u.name, u.owner, u.version, u.sha512, u.at], [N, null, 2, D2, 'https://mgubi.org/papers/']);
  assert.equal(u.canonical(A), `sheaf:${N}/v2?sha512=${D2}`);
  assert.equal(parseSheaf(`sheaf:${N}:${A}/v2`).canonical(A), `sheaf:${N}/v2`);
  assert.equal(parseSheaf(`sheaf:${N}:${J}/v2`).canonical(A), `sheaf:${N}:${J}/v2`);
  const short = parseSheaf('sheaf:zzgdggwl:tqr6lchn/v2', { short: true });
  assert.ok(!short.isComplete() && short.matches(N, J) && !short.matches(N, A));
  assert.throws(() => parseSheaf('sheaf:zzgdggwl/v2'), /52 characters/);
  assert.equal(String(parseSheaf(`SHEAF:${N.toUpperCase()}/V2`, { fold: true })), `sheaf:${N}/v2`);
  for (const bad of [`sheaf:${N}:*/v2`, `sheaf:${N}/v02`, `sheaf:${N}?sha512=${D2}`, `sheaf:${N}/v2?${at}&sha512=${D2}`,
                     `sheaf:${N}:${N1}`, `sheaf:${N}/v2?at=http%3A%2F%2Fx%2F`]) {
    assert.throws(() => parseSheaf(bad), /not a sheaf: URI/, bad);
  }
});

const VECTORS = [
  ['8c93255d71dcab10e8f379c26200f3c7bd5f09d9bc3068d3ef4edeb4853022b6', 'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
   'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a0000000000000000000000000000000000000000000000000000000000000000'],
  ['9bd9f44f4dcc75bd531b56b2cd280b0bb38fc1cd6d1230e14861d861de092e79', 'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
   'f7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43a5bb704786be79fc476f91d3f3f89b03984d8068dcf1bb7dfc6637b45450ac04'],
  ['aebf3f2601a0c8c5d39cc7d8911642f740b78168218da8471772b35f9d35b9ab', 'f7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43',
   'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa8c4bd45aecaca5b24fb97bc10ac27ac8751a7dfe1baff8b953ec9f5833ca260e'],
  ['9bd9f44f4dcc75bd531b56b2cd280b0bb38fc1cd6d1230e14861d861de092e79', 'cdb267ce40c5cd45306fa5d2f29731459387dbf9eb933b7bd5aed9a765b88d4d',
   '9046a64750444938de19f227bb80485e92b83fdb4b6506c160484c016cc1852f87909e14428a7a1d62e9f22f3d3ad7802db02eb2e688b6c52fcd6648a98bd009'],
  ['e47d62c63f830dc7a6851a0b1f33ae4bb2f507fb6cffec4011eaccd55b53f56c', 'cdb267ce40c5cd45306fa5d2f29731459387dbf9eb933b7bd5aed9a765b88d4d',
   '160a1cb0dc9c0258cd0a7d23e94d8fa878bcb1925f2c64246b2dee1796bed5125ec6bc982a269b723e0668e540911a9a6a58921d6925e434ab10aa7940551a09'],
  ['e47d62c63f830dc7a6851a0b1f33ae4bb2f507fb6cffec4011eaccd55b53f56c', 'cdb267ce40c5cd45306fa5d2f29731459387dbf9eb933b7bd5aed9a765b88d4d',
   '21122a84e0b5fca4052f5b1235c80a537878b38f3142356b2c2384ebad4668b7e40bc836dac0f71076f9abe3a53f9c03c1ceeeddb658d0030494ace586687405'],
  ['85e241a07d148b41e47d62c63f830dc7a6851a0b1f33ae4bb2f507fb6cffec40', '442aad9f089ad9e14647b1ef9099a1ff4798d78589e66f28eca69c11f582a623',
   'e96f66be976d82e60150baecff9906684aebb1ef181f67a7189ac78ea23b6c0e547f7690a0e2ddcd04d87dbc3490dc19b3b3052f7ff0538cb68afb369ba3a514'],
  ['85e241a07d148b41e47d62c63f830dc7a6851a0b1f33ae4bb2f507fb6cffec40', '442aad9f089ad9e14647b1ef9099a1ff4798d78589e66f28eca69c11f582a623',
   '8ce5b96c8f26d0ab6c47958c9e68b937104cd36e13c33566acd2fe8d38aa19427e71f98a473474f2f13f06f97c20d58cc3f54b8bd0d272f42b695dd7e89a8c22'],
  ['9bedc267423725d473888631ebf45988bad3db83851ee85c85e241a07d148b41', 'f7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43',
   'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff03be9678ac102edcd92b0210bb34d7428d12ffc5df5f37e359941266a4e35f0f'],
  ['9bedc267423725d473888631ebf45988bad3db83851ee85c85e241a07d148b41', 'f7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43',
   'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffca8c5b64cd208982aa38d4936621a4775aa233aa0505711d8fdcfdaa943d4908'],
  ['e96b7021eb39c1a163b6da4e3093dcd3f21387da4cc4572be588fafae23c155b', 'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
   'a9d55260f765261eb9b84e106f665e00b867287a761990d7135963ee0a7d59dca5bb704786be79fc476f91d3f3f89b03984d8068dcf1bb7dfc6637b45450ac04'],
  ['39a591f5321bbe07fd5a23dc2f39d025d74526615746727ceefd6e82ae65c06f', 'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
   'a9d55260f765261eb9b84e106f665e00b867287a761990d7135963ee0a7d59dca5bb704786be79fc476f91d3f3f89b03984d8068dcf1bb7dfc6637b45450ac04'],
];
const bytes = (text) => Uint8Array.from(text.match(/../g), (b) => parseInt(b, 16));

test('the edge cases of Ed25519, with both verifiers (section 7.2)', async () => {
  for (const engine of ['webcrypto', 'js', null]) {
    const accepted = [];
    for (const [msg, key, sig] of VECTORS) accepted.push(await verifyEd25519(bytes(key), bytes(msg), bytes(sig), { engine }));
    assert.deepEqual(accepted, VECTORS.map((_, k) => k === 3), `engine ${engine}`);
  }
  assert.deepEqual(VECTORS.map(([, key, sig]) => strictlyAcceptable(bytes(key), bytes(sig))),
    [false, false, false, true, true, true, false, false, false, false, false, false]);
});

test('the signatures of appendix C (sections C.1, C.3 and C.8)', async () => {
  for (const s of SIGNATURES) {
    const msg = message(s.object, s.version, s.inventorySha512, s.keyLog);
    const sig = unbase64(s.signature);
    for (const engine of ['webcrypto', 'js']) {
      assert.ok(await verifyEd25519(didKeyPublic(s.key), msg, sig, { engine }), `${s.file} ${engine}`);
      const changed = sig.slice();
      changed[10] ^= 1;
      assert.ok(!await verifyEd25519(didKeyPublic(s.key), msg, changed, { engine }));
      assert.ok(!await verifyEd25519(didKeyPublic(K1), msg, sig, { engine }));
    }
    assert.equal(await fileName(s.key), `signature-${s.file}.json`);
  }
  assert.equal(new TextDecoder().decode(message(PAPER_ID, 'v2', D2, `sheaf:${A}/v2?sha512=${KL2}`)),
    `opensheaf-signature/0.2\nobject ${PAPER_ID}\nversion v2\ninventory ${D2}\nkeylog sheaf:${A}/v2?sha512=${KL2}\n`);
});

test('the computed first version (sections 6.1 and C.1)', async () => {
  const v1 = await firstVersion(GENESIS_A);
  assert.equal(v1.digest, KL1);
  assert.equal(new TextDecoder().decode(v1.files.get('object.json')),
    `{"format":"opensheaf-object/0.2","kind":"owner","name":"${A}","owner":"${A}","specification":"0.2","status":"active"}`);
  assert.equal(new TextDecoder().decode(v1.files.get('keys.json')),
    `{"format":"opensheaf-keys/0.2","keys":["${K1}"],"next":["oxthfb6b4q3sqathmcpnciqggfxlr3aekgfg2tpm2lgrm2qnalha",` +
    '"h6k4k6c5u4dusj4szwimmaa5cozrwu4jo45xa6erpjggpyvla6vq","lnaifwjnrmhyjj3x7uikmzxznxfbgydi25iftupd2ktobmnpaklq"],' +
    '"nextThreshold":2,"threshold":1}');
  const log = await KeyLog.of(GENESIS_A);
  assert.deepEqual(await log.check(), { errors: [], warnings: [] });
  assert.equal(log.owner, A);
  assert.equal(log.pin(1), `sheaf:${A}/v1?sha512=${KL1}`);
  assert.equal(log.latest().number, 1);
  const [s] = SIGNATURES;
  const j = await judge(signatureFile(s), `signature-${s.file}.json`, { objectId: OWNER_ID, version: 'v2',
    inventory: KL2, owner: A, lookup: (n, d) => log.lookup(n, d), keyLog: true });
  assert.deepEqual([j.status, j.key, j.keyLog, j.threshold], [GOOD, R1, [1, KL1], 2]);
});

test('the rules of keys across versions (section 6.1, rules 1 to 4)', async () => {
  const first = (await readGenesis(GENESIS_A));
  const v2 = { format: 'opensheaf-keys/0.2', keys: [K3], threshold: 1,
               next: ['j77iavvdclktxkwmwefs7lw6fisdi7lqphwe33g4nboea35t2zga', 'nzvwkea25p62akdygzheep4qgoo3fw7ryimwytckea4njabtlfzq',
                      'fhujijfn3zmvteieps5l6raae73kndteaoju5js3ja33l2wvrqmq'], nextThreshold: 2 };
  assert.deepEqual(await keyRules(v2, [first], A), []);
  const rules = (change) => keyRules({ ...v2, ...change }, [first], A);
  assert.deepEqual(await rules({ threshold: 2 }), ['threshold 2 exceeds the 1 item(s) it counts (rule 1)']);
  assert.deepEqual(await rules({ keys: [K3, R1] }), ['keys lists a rotation key of an earlier version (rule 2)']);
  assert.deepEqual(await rules({ next: [...v2.next.slice(1), first.next[0]] }),
    ['next holds a digest that next of an earlier version holds (rule 3)']);
  assert.deepEqual(await rules({ next: [...v2.next.slice(1), await keyDigest(K1)] }),
    ['next holds the digest of a current key of an earlier version (rule 3)']);
  assert.deepEqual(await rules({ exposed: [K3] }), [
    'keys lists a key exposed by this version or an earlier one (rule 2)',
    'exposed lists a key that keys of no earlier version lists (rule 4)']);
  assert.deepEqual(await rules({ exposed: [K1] }), []);
  assert.deepEqual(await keyRules({ format: 'opensheaf-keys/0.2', ended: true, successor: A }, [first], A),
    ['successor is the owner name of another owner (section 6.3)']);
  assert.deepEqual(await keyRules({ format: 'opensheaf-keys/0.2', ended: true, keys: [K3] }, [first], A),
    ['an ending version has no keys, threshold, next or nextThreshold (section 6.3)']);
});

async function keyLogOf(archive) {
  const a = await Archive.open(new Http({ fetch: diskFetch() }), ORIGIN + archive + '/');
  return a.keyLog(a.owners()[0]);
}

test('the key logs of the fixtures', async () => {
  for (const name of ['archive', 'other', 'forked']) {
    const log = await keyLogOf(name);
    assert.deepEqual(await log.check(), { errors: [], warnings: [] }, name);
    const v1 = await firstVersion(log.genesis);
    assert.equal(log.versions[0].digest, v1.digest);
  }
  const other = await keyLogOf('other');
  assert.equal(other.exposedKeys().size, 1);
  assert.ok(!other.ended && other.latest().number === 2);
  assert.ok(!other.latest().keys.keys.includes([...other.exposedKeys()][0]));
  const forked = await keyLogOf('forked');
  assert.equal(forked.forkPoint, 2);
  assert.ok(forked.ended && forked.latest() === null);
  assert.equal(forked.versions[2].forkRecord, true);
  const carried = forked.forkRecord.carried[0];
  assert.equal(carried.number, 2);
  assert.equal(forked.lookup(2, carried.digest), carried);
  assert.notEqual(forked.versions[1].digest, carried.digest);
});

test('two copies of a key log met by a reader (sections 6.3 and 6.5)', async () => {
  const forked = await keyLogOf('forked');
  const [v1, v2] = forked.versions;
  const short = new KeyLog(forked.genesis, forked.owner, [v1]);
  const own = new KeyLog(forked.genesis, forked.owner, [v1, v2]);
  assert.equal((await short.meet(own)).side().length, 2);
  assert.equal((await own.meet(short)).side().length, 2);
  const c = forked.forkRecord.carried[0];
  const objectFile = utf8(JSON.stringify(ownerObject(forked.owner, v1.digest)));
  const twinV2 = await Version.make(2, new Map([['genesis.json', forked.genesis], ['object.json', objectFile],
    ['keys.json', c.files.get('keys.json')]]), c.inventory, c.sidecar, c.witnesses);
  const twin = new KeyLog(forked.genesis, forked.owner, [v1, twinV2]);
  assert.deepEqual((await twin.check()).errors, []);
  const met = await own.meet(twin);
  assert.equal(met.forkPoint, 2);
  assert.ok(met.ended);
  assert.equal(met.lookup(2, twinV2.digest)?.number, 2);
  assert.equal((await forked.meet(twin)).forkPoint, 2);
});

const good = (key, n = 1, threshold = 1) => ({ status: GOOD, key, keyLog: [n, 'd'], threshold });

test('the statuses of the versions of a line (section 7.3)', () => {
  assert.deepEqual(lineStatuses([[good('k1')], [], [good('k1')]]), ['signed', 'vouched for', 'signed']);
  assert.deepEqual(lineStatuses([[good('k1')], [good('k2')]], { exposed: new Set(['k1']) }), ['signed', 'signed']);
  assert.deepEqual(lineStatuses([[good('k1')], []], { exposed: new Set(['k1']) }), ['contested', 'unsigned']);
  assert.deepEqual(lineStatuses([[], [good('k1')]], { exposed: new Set(['k1']) }), ['contested', 'contested']);
  assert.deepEqual(lineStatuses([[good('k1', 1)], [good('k1', 2)]], { forkPoint: 2 }), ['signed', 'contested']);
  assert.deepEqual(lineStatuses([[good('k1', 2)]], { forkPoint: 2, trusted: () => true }), ['signed']);
  assert.deepEqual(lineStatuses([[good('k1', 1, 2)], [good('k1', 1, 2), good('k2', 1, 2)]]), ['vouched for', 'signed']);
  assert.deepEqual(lineStatuses([[{ status: UNCHECKED, key: 'k', keyLog: [1, 'd'] }]]), ['unchecked']);
  assert.deepEqual(lineStatuses([[{ status: INVALID }], []]), ['invalid', 'unsigned']);
  assert.equal(latestSigned(['signed', 'vouched for', 'contested']), 2);
  assert.equal(latestSigned(['contested']), null);
});

test('the statuses of a signature file (section 7.3)', async () => {
  const s = SIGNATURES[1];
  const file = `signature-${s.file}.json`;
  const context = { objectId: PAPER_ID, version: 'v2', inventory: D2, owner: A, lookup: () => null };
  const status = async (bytes, name = file, change = {}) => {
    const j = await judge(bytes, name, { ...context, ...change });
    return [j.status, j.reason];
  };
  assert.deepEqual(await status(signatureFile(s)), [UNCHECKED, 'v2 of the key log, with that digest, is not reached']);
  const v2 = { number: 2, isVersion: true, forkRecord: false, keys: { keys: [K3], threshold: 1 } };
  assert.deepEqual(await status(signatureFile(s), file, { lookup: () => v2 }), [GOOD, '']);
  assert.deepEqual(await status(signatureFile(s), file, { lookup: () => ({ ...v2, keys: { keys: [K1], threshold: 1 } }) }),
    [INVALID, 'the key is not a current key of v2 of the key log']);
  assert.deepEqual(await status(signatureFile(s), file, { lookup: () => ({ ...v2, forkRecord: true }) }),
    [INVALID, 'v2 is not a version of the key log, or is a fork record']);
  assert.equal((await status(utf8('not json')))[0], INVALID);
  assert.deepEqual(await status(signatureFile(s), 'signature-aaaaaaaaaaaaaaaa.json'), [INVALID, 'its name does not match the digest of its key']);
  assert.deepEqual(await status(signatureFile(s), file, { version: 'v3' }), [INVALID, 'it signs another version, or another inventory']);
  assert.deepEqual(await status(signatureFile(s), file, { owner: 'tqr6lchnd2vk7ezskdc5zdxpaidpsiuduo5sqhiis3i55iautdka' }),
    [INVALID, 'its signer is not the owner of the line']);
  assert.deepEqual(await status(signatureFile(s, { inventorySha512: KL1 })), [INVALID, 'the signature does not verify']);
  assert.throws(() => readSignatureFile(signatureFile(s, { extra: 1 })), /exactly the fields/);
  assert.throws(() => readSignatureFile(signatureFile(s, { signer: 'tqr6lchnd2vk7ezskdc5zdxpaidpsiuduo5sqhiis3i55iautdka' })),
    /keyLog names the key log of another owner/);
});
