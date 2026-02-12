// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { Command } from 'commander';
import registerConfig from './cmd/config.js';
import registerDoctor from './cmd/doctor.js';
import registerInit from './cmd/init.js';
import registerLogin from './cmd/login.js';
import registerFirehose from './cmd/firehose.js';
import registerPdsRecord from './cmd/pds-record.js';
import registerSetup from './cmd/setup.js';

const program = new Command();
program
  .name('vit')
  .description('CLI toolkit for DID:PLC operations and Bluesky OAuth')
  .version('0.1.0');

registerConfig(program);
registerDoctor(program);
registerInit(program);
registerLogin(program);
registerFirehose(program);
registerPdsRecord(program);
registerSetup(program);

export { program };
