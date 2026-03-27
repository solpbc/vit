// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

const VIT_MARK = 'v\u0307';  // v̇
const VIT_BRAND = `${VIT_MARK}it`;  // v̇it

const canCombine = process.stdout.isTTY && !process.env.TERM?.startsWith('dumb');
const brand = canCombine ? VIT_BRAND : 'vit';
const mark = canCombine ? VIT_MARK : 'v';
const prefix = canCombine ? `[${VIT_MARK}]` : '[v]';
const name = 'vit';

const DOT_VIT_README = `# .${VIT_BRAND}

this project participates in the social open source network. capabilities flow through people and agents you trust — not through gatekeepers or centralized platforms. the future of open source is social.

learn more at [v-it.org](https://v-it.org)
`;

export { VIT_MARK, VIT_BRAND, brand, mark, prefix, name, DOT_VIT_README };
