// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { Command } from 'commander';
import { brand } from './lib/brand.js';
import registerAdopt from './cmd/adopt.js';
import registerBeacon from './cmd/beacon.js';
import registerConfig from './cmd/config.js';
import registerDoctor from './cmd/doctor.js';
import registerExplore from './cmd/explore.js';
import registerInit from './cmd/init.js';
import registerLearn from './cmd/learn.js';
import registerLogin from './cmd/login.js';
import registerFirehose from './cmd/firehose.js';
import registerScan from './cmd/scan.js';
import registerRemix from './cmd/remix.js';
import registerShip from './cmd/ship.js';
import registerSkim from './cmd/skim.js';
import registerVet from './cmd/vet.js';
import registerVouch from './cmd/vouch.js';
import registerFollow from './cmd/follow.js';
import registerSetup from './cmd/setup.js';
import registerHack from './cmd/hack.js';
import registerLink from './cmd/link.js';

const program = new Command();
program
  .name('vit')
  .description(`${brand} \u2014 social open source`)
  .version('0.1.0');

registerAdopt(program);
registerBeacon(program);
registerConfig(program);
registerDoctor(program);
registerExplore(program);
registerInit(program);
registerLearn(program);
registerLogin(program);
registerFirehose(program);
registerScan(program);
registerShip(program);
registerSkim(program);
registerRemix(program);
registerVet(program);
registerVouch(program);
registerFollow(program);
registerSetup(program);
registerHack(program);
registerLink(program);

export { program };
