// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { TID } from '@atproto/common-web';
import { CAP_COLLECTION } from './constants.js';
import { resolveRef } from './cap-ref.js';

export async function publishCap(agent, input) {
  if (input.repo == null || input.repo !== agent.did) {
    throw new Error('write target must match authenticated agent');
  }
  if (input.swapCid != null && input.rkey == null) {
    throw new Error('swap CID requires an rkey');
  }
  if (input.reply) {
    const { root, parent } = input.reply;
    if (
      !root
      || !parent
      || typeof root.uri !== 'string'
      || typeof root.cid !== 'string'
      || typeof parent.uri !== 'string'
      || typeof parent.cid !== 'string'
    ) {
      throw new Error('reply must include valid root and parent references');
    }
  }
  if (input.embed) {
    const external = input.embed.external;
    if (
      !external
      || typeof external.uri !== 'string'
      || typeof external.title !== 'string'
      || typeof external.description !== 'string'
    ) {
      throw new Error('embed must include a valid external value');
    }
  }

  const record = {
    $type: CAP_COLLECTION,
    text: input.text || '',
    title: input.title,
    description: input.description,
    ref: input.ref,
    createdAt: input.createdAt,
  };
  if (input.beacon) record.beacon = input.beacon;
  if (input.kind) record.kind = input.kind;
  if (input.recap) record.recap = input.recap;
  if (input.reply) record.reply = input.reply;
  if (input.embed) record.embed = input.embed;

  const rkey = input.rkey ?? TID.nextStr();
  const putArgs = {
    repo: input.repo,
    collection: CAP_COLLECTION,
    rkey,
    record,
    validate: false,
  };
  if (input.swapCid != null) putArgs.swapRecord = input.swapCid;

  const putRes = await agent.com.atproto.repo.putRecord(putArgs);
  return {
    uri: putRes.data.uri,
    cid: putRes.data.cid,
    ref: resolveRef(record, putRes.data.cid),
    rkey,
    record,
    response: putRes.data,
  };
}
