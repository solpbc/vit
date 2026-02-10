// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { Command } from 'commander';
import registerOauth from './cmd/oauth.js';
import registerPlcRegister from './cmd/plc-register.js';
import registerPlcVerify from './cmd/plc-verify.js';
import registerFirehose from './cmd/firehose.js';
import registerPdsRecord from './cmd/pds-record.js';

const program = new Command();
program
  .name('vit')
  .description('CLI toolkit for DID:PLC operations and Bluesky OAuth')
  .version('0.1.0');

registerOauth(program);
registerPlcRegister(program);
registerPlcVerify(program);
registerFirehose(program);
registerPdsRecord(program);

export { program };
