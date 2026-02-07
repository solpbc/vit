#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Minimal DID:PLC genesis op generator + registrar.

Requirements (Python 3.9+):
  pip install cryptography dag-cbor base58 requests

Example:
  # Minimal (k256, no AKA/services):
  python plc_genesis_register.py

  # With handle and PDS (repeatable; does not upload keys):
  python plc_genesis_register.py --aka at://alice.example --pds https://pds.example.com

  # Use p256 instead of k256:
  python plc_genesis_register.py --curve p256 --aka at://bob.example --pds https://pds.example.com
"""

import argparse
import base64
import dataclasses
import hashlib
import json
import pathlib
import sys
import typing as t

import base58
import dag_cbor
import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

# --- Constants from atproto crypto spec (multicodec varints for compressed pubkeys) ---
# p256-pub  code 0x1200  -> varint bytes [0x80, 0x24]
# secp256k1-pub code 0xE7 -> varint bytes [0xE7, 0x01]
# Ref: https://atproto.com/specs/cryptography
MC_P256_PUB = bytes([0x80, 0x24])
MC_K256_PUB = bytes([0xE7, 0x01])

# Curve orders (for low-S canonicalization)
# Ref: standards / well-known constants
N_K256 = int("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16)
N_P256 = int("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", 16)


def ensure_dir(path: pathlib.Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def b64url_nopad(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def base32_lower_nopad(data: bytes) -> str:
    # Python emits uppercase with padding; PLC uses lowercase, no padding
    return base64.b32encode(data).decode("ascii").lower().rstrip("=")


def compress_pubkey_bytes(pubkey) -> bytes:
    # cryptography supports X9.62 compressed point for p256 and k256
    return pubkey.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.CompressedPoint,
    )


def did_key_for_pub(curve: str, pubkey_bytes_compressed: bytes) -> str:
    if curve == "k256":
        pref = MC_K256_PUB
    elif curve == "p256":
        pref = MC_P256_PUB
    else:
        raise ValueError("curve must be 'k256' or 'p256'")
    mb = b"z" + base58.b58encode(pref + pubkey_bytes_compressed)
    return "did:key:" + mb.decode("ascii")


def low_s_r_s(curve: str, r: int, s: int) -> t.Tuple[int, int]:
    if curve == "k256":
        n = N_K256
    else:
        n = N_P256
    # Enforce low-S (s <= n/2)
    if s > n // 2:
        s = n - s
    return r, s


def sign_low_s_raw(curve: str, private_key, message: bytes) -> bytes:
    # cryptography signs ECDSA over the given hash algorithm
    der_sig = private_key.sign(message, ec.ECDSA(hashes.SHA256()))
    r, s = utils.decode_dss_signature(der_sig)
    r, s = low_s_r_s(curve, r, s)
    # raw 64-byte r||s big-endian
    rb = r.to_bytes(32, "big")
    sb = s.to_bytes(32, "big")
    return rb + sb


@dataclasses.dataclass
class KeyBundle:
    curve: str  # 'k256' or 'p256'
    priv_pem_path: pathlib.Path
    pub_pem_path: pathlib.Path
    did_key: str
    signing_key_bytes: bytes  # compressed point (33 bytes)


def generate_rotation_key(outdir: pathlib.Path, curve: str, verbose: bool = False) -> KeyBundle:
    ensure_dir(outdir)
    if curve == "k256":
        priv = ec.generate_private_key(ec.SECP256K1(), backend=default_backend())
    elif curve == "p256":
        priv = ec.generate_private_key(ec.SECP256R1(), backend=default_backend())
    else:
        raise ValueError("curve must be 'k256' or 'p256'")

    pub = priv.public_key()

    # Save keys (unencrypted PEM for simplicity; protect these in real deployments)
    priv_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    priv_path = outdir / f"rotation_{curve}_private.pem"
    pub_path = outdir / f"rotation_{curve}_public.pem"
    priv_path.write_bytes(priv_pem)
    pub_path.write_bytes(pub_pem)

    # did:key for rotation key is allowed;
    # PLC only requires rotationKeys to be did:key of k256 or p256
    compressed = compress_pubkey_bytes(pub)
    didk = did_key_for_pub(curve, compressed)

    if verbose:
        print(f"[verbose] Generated {curve.upper()} keypair")
        print(f"[verbose] Compressed pubkey: {compressed.hex()}")

    return KeyBundle(
        curve=curve,
        priv_pem_path=priv_path,
        pub_pem_path=pub_path,
        did_key=didk,
        signing_key_bytes=compressed,
    )


def build_unsigned_op(
    rotation_did_keys: t.List[str], aka_list: t.List[str], pds_endpoint: t.Optional[str]
) -> dict:
    # Minimal regular op shape; empty maps/lists are fine
    verification_methods = {}
    services = {}
    if pds_endpoint:
        services["atproto_pds"] = {
            "type": "AtprotoPersonalDataServer",
            "endpoint": pds_endpoint,
        }
    return {
        "type": "plc_operation",
        "rotationKeys": rotation_did_keys,
        "verificationMethods": verification_methods,
        "alsoKnownAs": aka_list,
        "services": services,
        "prev": None,  # must be present and null for genesis
        # 'sig' inserted after signing
    }


def derive_plc_did(signed_op: dict) -> str:
    cbor = dag_cbor.encode(signed_op)
    digest = hashlib.sha256(cbor).digest()
    suffix = base32_lower_nopad(digest)[:24]
    return "did:plc:" + suffix


def main():
    ap = argparse.ArgumentParser(description="Generate & register a DID:PLC genesis operation.")
    ap.add_argument(
        "--out", default="plc_keys", help="Output directory for keys (default: plc_keys)"
    )
    ap.add_argument("--curve", choices=["k256", "p256"], default="k256", help="Rotation key curve")
    ap.add_argument(
        "--aka",
        action="append",
        default=[],
        help="alsoKnownAs entry (e.g., at://alice.example). May repeat.",
    )
    ap.add_argument("--pds", default=None, help="PDS endpoint URL (e.g., https://pds.example.com)")
    ap.add_argument("--dry-run", action="store_true", help="Build & print but do not POST to PLC")
    ap.add_argument("-v", "--verbose", action="store_true", help="Show verbose output")
    args = ap.parse_args()

    outdir = pathlib.Path(args.out)
    kb = generate_rotation_key(outdir, args.curve, args.verbose)

    unsigned = build_unsigned_op([kb.did_key], args.aka, args.pds)

    if args.verbose:
        print("[verbose] Unsigned operation:")
        print(json.dumps(unsigned, indent=2))

    # Sign DAG-CBOR bytes of unsigned op (without 'sig')
    unsigned_cbor = dag_cbor.encode(unsigned)
    if args.verbose:
        print(f"[verbose] Encoded CBOR size: {len(unsigned_cbor)} bytes")

    # cryptography ECDSA expects the message; spec requires ECDSA-SHA256;
    # library will hash internally. To sign the SHA256 digest explicitly,
    # replace message with hashlib.sha256(unsigned_cbor).digest()
    # and switch to ec.Prehashed(hashes.SHA256()).
    # Low-S enforcement + raw r||s per atproto crypto guidance.
    priv = serialization.load_pem_private_key(kb.priv_pem_path.read_bytes(), password=None)
    raw_sig = sign_low_s_raw(args.curve, priv, unsigned_cbor)
    sig_b64u = b64url_nopad(raw_sig)

    if args.verbose:
        print(f"[verbose] Signature (base64url): {sig_b64u}")

    signed = dict(unsigned)
    signed["sig"] = sig_b64u

    did = derive_plc_did(signed)

    if args.verbose:
        signed_cbor = dag_cbor.encode(signed)
        digest = hashlib.sha256(signed_cbor).digest()
        print(f"[verbose] SHA256 of signed op: {digest.hex()}")

    # Save artifacts
    (outdir / "genesis_unsigned.dag-cbor").write_bytes(unsigned_cbor)
    (outdir / "genesis_signed.json").write_text(
        json.dumps(signed, separators=(",", ":"), ensure_ascii=False) + "\n"
    )
    (outdir / "did.txt").write_text(did + "\n")
    (outdir / "rotation_did_key.txt").write_text(kb.did_key + "\n")

    if args.verbose:
        print(f"[verbose] Wrote genesis_unsigned.dag-cbor ({len(unsigned_cbor)} bytes)")
        print("[verbose] Wrote genesis_signed.json")
        print("[verbose] Wrote did.txt")
        print("[verbose] Wrote rotation_did_key.txt")

    print(f"Rotation key (did:key): {kb.did_key}")
    print(f"DID (derived):          {did}")
    print(f"Wrote keys & artifacts to: {outdir.resolve()}")

    if args.dry_run:
        print("Dry run selected; not POSTing to PLC.")
        return

    # Submit to PLC directory (HTTP POST JSON to .../{did})
    url = f"https://plc.directory/{did}"
    if args.verbose:
        print(f"[verbose] POSTing to {url}")
        print("[verbose] Request body:")
        print(json.dumps(signed, indent=2))

    try:
        resp = requests.post(url, json=signed, timeout=10)
        print(f"POST {url} -> {resp.status_code}")
        print(resp.text[:5000])
        if 200 <= resp.status_code < 300:
            print("Registration appears successful.")
        else:
            print("Registration failed; see response above.")
    except Exception as e:
        print(f"Error POSTing to PLC: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
