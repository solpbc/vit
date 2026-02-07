#!/usr/bin/env bun

import { secp256k1 } from '@noble/curves/secp256k1';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { encode as dagCborEncode } from '@ipld/dag-cbor';
import bs58 from 'bs58';
import { Command } from 'commander';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MC_P256_PUB = new Uint8Array([0x80, 0x24]);
const MC_K256_PUB = new Uint8Array([0xe7, 0x01]);
const N_K256 = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const N_P256 = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

const K256_ALG_ID = new Uint8Array([
  0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05, 0x2b, 0x81,
  0x04, 0x00, 0x0a,
]);

const P256_ALG_ID = new Uint8Array([
  0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86,
  0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
]);

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function b64urlNopad(data) {
  return Buffer.from(data).toString('base64url').replace(/=+$/g, '');
}

function base32LowerNopad(data) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }
  return result;
}

function getCurve(curve) {
  if (curve === 'k256') {
    return { ec: secp256k1, order: N_K256, mcPrefix: MC_K256_PUB, algId: K256_ALG_ID };
  }
  if (curve === 'p256') {
    return { ec: p256, order: N_P256, mcPrefix: MC_P256_PUB, algId: P256_ALG_ID };
  }
  throw new Error("curve must be 'k256' or 'p256'");
}

function didKeyForPub(curve, compressedPubkey) {
  const { mcPrefix } = getCurve(curve);
  const prefixed = new Uint8Array(mcPrefix.length + compressedPubkey.length);
  prefixed.set(mcPrefix);
  prefixed.set(compressedPubkey, mcPrefix.length);
  return 'did:key:z' + bs58.encode(prefixed);
}

function lowS(curve, r, s) {
  const { order } = getCurve(curve);
  if (s > order / 2n) {
    s = order - s;
  }
  return [r, s];
}

function bigintToBytes(n, length) {
  const hex = n.toString(16).padStart(length * 2, '0');
  if (hex.length > length * 2) {
    throw new Error(`integer too large for ${length} bytes`);
  }
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function signLowSRaw(curve, privateKey, message) {
  const { ec } = getCurve(curve);
  const msgHash = sha256(message);
  const sig = ec.sign(msgHash, privateKey);
  let [r, s] = [sig.r, sig.s];
  [r, s] = lowS(curve, r, s);
  const raw = new Uint8Array(64);
  raw.set(bigintToBytes(r, 32), 0);
  raw.set(bigintToBytes(s, 32), 32);
  return raw;
}

function derLength(length) {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  if (length <= 0xff) {
    return Buffer.from([0x81, length]);
  }
  return Buffer.from([0x82, (length >>> 8) & 0xff, length & 0xff]);
}

function derWrap(tag, content) {
  const body = Buffer.from(content);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

function derSequence(parts) {
  const content = Buffer.concat(parts.map((part) => Buffer.from(part)));
  return derWrap(0x30, content);
}

function derIntegerSmall(n) {
  if (n === 0) return Buffer.from([0x02, 0x01, 0x00]);
  if (n === 1) return Buffer.from([0x02, 0x01, 0x01]);
  throw new Error('unsupported integer');
}

function derOctetString(data) {
  return derWrap(0x04, data);
}

function derBitString(data) {
  return derWrap(0x03, Buffer.concat([Buffer.from([0x00]), Buffer.from(data)]));
}

function buildPkcs8Der(curve, privateKeyBytes, uncompressedPubkey) {
  const { algId } = getCurve(curve);
  const ecPrivateKey = derSequence([
    derIntegerSmall(1),
    derOctetString(privateKeyBytes),
    derWrap(0xa1, derBitString(uncompressedPubkey)),
  ]);
  return derSequence([derIntegerSmall(0), algId, derOctetString(ecPrivateKey)]);
}

function buildSpkiDer(curve, uncompressedPubkey) {
  const { algId } = getCurve(curve);
  return derSequence([algId, derBitString(uncompressedPubkey)]);
}

function toPem(label, der) {
  const b64 = Buffer.from(der).toString('base64');
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

function generateRotationKey(outdir, curve, verbose = false) {
  ensureDir(outdir);
  const { ec } = getCurve(curve);

  const privateKeyBytes = ec.utils.randomPrivateKey();
  const compressed = ec.getPublicKey(privateKeyBytes, true);
  const uncompressed = ec.getPublicKey(privateKeyBytes, false);

  const privPemPath = `${outdir}/rotation_${curve}_private.pem`;
  const pubPemPath = `${outdir}/rotation_${curve}_public.pem`;

  const privatePem = toPem('PRIVATE KEY', buildPkcs8Der(curve, privateKeyBytes, uncompressed));
  const publicPem = toPem('PUBLIC KEY', buildSpkiDer(curve, uncompressed));
  writeFileSync(privPemPath, privatePem);
  writeFileSync(pubPemPath, publicPem);

  const didKey = didKeyForPub(curve, compressed);

  if (verbose) {
    console.log(`[verbose] Generated ${curve.toUpperCase()} keypair`);
    console.log(`[verbose] Compressed pubkey: ${Buffer.from(compressed).toString('hex')}`);
  }

  return {
    curve,
    privPemPath,
    pubPemPath,
    didKey,
    privateKeyBytes,
    compressed,
  };
}

function buildUnsignedOp(rotationDidKeys, akaList, pdsEndpoint) {
  const verificationMethods = {};
  const services = {};
  if (pdsEndpoint) {
    services.atproto_pds = {
      type: 'AtprotoPersonalDataServer',
      endpoint: pdsEndpoint,
    };
  }
  return {
    type: 'plc_operation',
    rotationKeys: rotationDidKeys,
    verificationMethods: verificationMethods,
    alsoKnownAs: akaList,
    services: services,
    prev: null,
  };
}

function derivePlcDid(signedOp) {
  const cbor = dagCborEncode(signedOp);
  const digest = sha256(cbor);
  const suffix = base32LowerNopad(digest).slice(0, 24);
  return 'did:plc:' + suffix;
}

function collect(value, previous) {
  previous.push(value);
  return previous;
}

async function main() {
  const program = new Command();
  program
    .description('Generate & register a DID:PLC genesis operation.')
    .option('--out <dir>', 'Output directory for keys (default: plc_keys)', 'plc_keys')
    .option('--curve <curve>', 'Rotation key curve', 'k256')
    .option('--aka <uri>', 'alsoKnownAs entry (e.g., at://alice.example). May repeat.', collect, [])
    .option('--pds <url>', 'PDS endpoint URL (e.g., https://pds.example.com)')
    .option('--dry-run', 'Build & print but do not POST to PLC')
    .option('-v, --verbose', 'Show verbose output')
    .parse();

  const args = program.opts();
  if (!['k256', 'p256'].includes(args.curve)) {
    console.error(`error: option '--curve' must be 'k256' or 'p256'`);
    process.exit(1);
  }
  const kb = generateRotationKey(args.out, args.curve, args.verbose);
  const unsigned = buildUnsignedOp([kb.didKey], args.aka, args.pds ?? null);

  if (args.verbose) {
    console.log('[verbose] Unsigned operation:');
    console.log(JSON.stringify(unsigned, null, 2));
  }

  const unsignedCbor = dagCborEncode(unsigned);
  if (args.verbose) {
    console.log(`[verbose] Encoded CBOR size: ${unsignedCbor.length} bytes`);
  }

  const rawSig = signLowSRaw(args.curve, kb.privateKeyBytes, unsignedCbor);
  const sigB64u = b64urlNopad(rawSig);

  if (args.verbose) {
    console.log(`[verbose] Signature (base64url): ${sigB64u}`);
  }

  const signed = { ...unsigned, sig: sigB64u };
  const did = derivePlcDid(signed);

  if (args.verbose) {
    const signedCbor = dagCborEncode(signed);
    const digest = sha256(signedCbor);
    console.log(`[verbose] SHA256 of signed op: ${Buffer.from(digest).toString('hex')}`);
  }

  writeFileSync(`${args.out}/genesis_unsigned.dag-cbor`, Buffer.from(unsignedCbor));
  writeFileSync(`${args.out}/genesis_signed.json`, `${JSON.stringify(signed)}\n`);
  writeFileSync(`${args.out}/did.txt`, `${did}\n`);
  writeFileSync(`${args.out}/rotation_did_key.txt`, `${kb.didKey}\n`);

  if (args.verbose) {
    console.log(`[verbose] Wrote genesis_unsigned.dag-cbor (${unsignedCbor.length} bytes)`);
    console.log('[verbose] Wrote genesis_signed.json');
    console.log('[verbose] Wrote did.txt');
    console.log('[verbose] Wrote rotation_did_key.txt');
  }

  console.log(`Rotation key (did:key): ${kb.didKey}`);
  console.log(`DID (derived):          ${did}`);
  console.log(`Wrote keys & artifacts to: ${resolve(args.out)}`);

  if (args.dryRun) {
    console.log('Dry run selected; not POSTing to PLC.');
    return;
  }

  const url = `https://plc.directory/${did}`;
  if (args.verbose) {
    console.log(`[verbose] POSTing to ${url}`);
    console.log('[verbose] Request body:');
    console.log(JSON.stringify(signed, null, 2));
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed),
      signal: AbortSignal.timeout(10000),
    });
    const text = await resp.text();
    console.log(`POST ${url} -> ${resp.status}`);
    console.log(text.slice(0, 5000));
    if (resp.ok) {
      console.log('Registration appears successful.');
    } else {
      console.log('Registration failed; see response above.');
    }
  } catch (e) {
    process.stderr.write(`Error POSTing to PLC: ${e}\n`);
    process.exit(2);
  }
}

await main();
