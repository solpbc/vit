// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import envPaths from 'env-paths';
import { join } from 'node:path';

const paths = envPaths('vit');

export const configDir = paths.config;
export const configPath = (filename) => join(paths.config, filename);
