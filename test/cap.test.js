// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { publishCap } from '../src/lib/cap.js';

function makeAgent(did, putImpl) {
  const calls = [];
  const agent = {
    did,
    com: {
      atproto: {
        repo: {
          putRecord: async (args) => {
            calls.push(args);
            return putImpl
              ? putImpl(args)
              : { data: { uri: `at://${did}/org.v-it.cap/${args.rkey}`, cid: 'bafyTESTCID' } };
          },
        },
      },
    },
  };
  agent.calls = calls;
  return agent;
}

function makeInput(overrides = {}) {
  return {
    repo: 'did:plc:test',
    text: 'Cap body',
    title: 'Test cap',
    description: 'A test capability',
    ref: 'one-two-three',
    createdAt: '2026-07-11T12:00:00.000Z',
    ...overrides,
  };
}

describe('publishCap', () => {
  test('creates an exact cap record', async () => {
    const agent = makeAgent('did:plc:test');
    const input = makeInput({
      beacon: 'vit:example.com/o/r',
      kind: 'feat',
      rkey: '3mtestcreate',
    });

    const res = await publishCap(agent, input);

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]).toEqual({
      repo: 'did:plc:test',
      collection: 'org.v-it.cap',
      rkey: '3mtestcreate',
      record: {
        $type: 'org.v-it.cap',
        text: 'Cap body',
        title: 'Test cap',
        description: 'A test capability',
        ref: 'one-two-three',
        createdAt: '2026-07-11T12:00:00.000Z',
        beacon: 'vit:example.com/o/r',
        kind: 'feat',
      },
      validate: false,
    });
    expect(agent.calls[0].swapRecord).toBeUndefined();
    expect(res).toMatchObject({
      uri: 'at://did:plc:test/org.v-it.cap/3mtestcreate',
      cid: 'bafyTESTCID',
      ref: 'one-two-three',
      rkey: '3mtestcreate',
    });
  });

  test('generates an rkey when omitted', async () => {
    const agent = makeAgent('did:plc:test');

    const res = await publishCap(agent, makeInput());

    expect(res.rkey).toBeString();
    expect(res.rkey.length).toBeGreaterThan(0);
    expect(agent.calls[0].rkey).toBe(res.rkey);
  });

  test('refreshes a record with compare-and-swap', async () => {
    const agent = makeAgent('did:plc:test');
    const createdAt = '2026-07-11T13:00:00.000Z';

    await publishCap(agent, makeInput({
      createdAt,
      rkey: '3mtestrefresh',
      swapCid: 'bafyOLDCID',
    }));

    expect(agent.calls[0].swapRecord).toBe('bafyOLDCID');
    expect(agent.calls[0].rkey).toBe('3mtestrefresh');
    expect(agent.calls[0].record.createdAt).toBe(createdAt);
  });

  test('includes a valid reply', async () => {
    const agent = makeAgent('did:plc:test');
    const reply = {
      root: { uri: 'at://did:plc:root/org.v-it.cap/root', cid: 'bafyROOT' },
      parent: { uri: 'at://did:plc:parent/org.v-it.cap/parent', cid: 'bafyPARENT' },
    };

    await publishCap(agent, makeInput({ reply }));

    expect(agent.calls[0].record.reply).toEqual(reply);
  });

  test('includes a valid external embed', async () => {
    const agent = makeAgent('did:plc:test');
    const embed = {
      $type: 'app.bsky.embed.external',
      external: {
        uri: 'https://example.com/cap',
        title: 'Example cap',
        description: 'External cap context',
      },
    };

    await publishCap(agent, makeInput({ embed }));

    expect(agent.calls[0].record.embed).toEqual(embed);
  });

  test('rejects a mismatched repo before writing', async () => {
    const agent = makeAgent('did:plc:other');

    await expect(publishCap(agent, makeInput())).rejects.toThrow(
      'write target must match authenticated agent',
    );
    expect(agent.calls).toHaveLength(0);
  });

  test('rejects a swap CID without an rkey before writing', async () => {
    const agent = makeAgent('did:plc:test');

    await expect(publishCap(agent, makeInput({ swapCid: 'bafyOLDCID' }))).rejects.toThrow(
      'swap CID requires an rkey',
    );
    expect(agent.calls).toHaveLength(0);
  });

  test('rejects malformed replies before writing', async () => {
    const replies = [
      { root: { uri: 'at://did:plc:root/org.v-it.cap/root', cid: 'bafyROOT' } },
      {
        root: { uri: 'at://did:plc:root/org.v-it.cap/root' },
        parent: { uri: 'at://did:plc:parent/org.v-it.cap/parent', cid: 'bafyPARENT' },
      },
    ];

    for (const reply of replies) {
      const agent = makeAgent('did:plc:test');
      await expect(publishCap(agent, makeInput({ reply }))).rejects.toThrow(
        'reply must include valid root and parent references',
      );
      expect(agent.calls).toHaveLength(0);
    }
  });

  test('rejects a malformed embed before writing', async () => {
    const agent = makeAgent('did:plc:test');
    const embed = {
      $type: 'app.bsky.embed.external',
      external: { uri: 'https://example.com/cap', description: 'Missing title' },
    };

    await expect(publishCap(agent, makeInput({ embed }))).rejects.toThrow(
      'embed must include a valid external value',
    );
    expect(agent.calls).toHaveLength(0);
  });

  test('propagates a stale-CID conflict after attempting the write', async () => {
    const agent = makeAgent('did:plc:test', () => {
      throw new Error('InvalidSwap');
    });

    await expect(publishCap(agent, makeInput({
      rkey: '3mtestrefresh',
      swapCid: 'bafySTALECID',
    }))).rejects.toThrow('InvalidSwap');
    expect(agent.calls).toHaveLength(1);
  });

  test('propagates an agent rejection after attempting the write', async () => {
    const agent = makeAgent('did:plc:test', () => {
      throw new Error('boom');
    });

    await expect(publishCap(agent, makeInput())).rejects.toThrow('boom');
    expect(agent.calls).toHaveLength(1);
  });
});
