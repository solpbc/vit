// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import envPaths from 'env-paths';
import { join } from 'node:path';

const paths = envPaths('vit', { suffix: '' });

export const configDir = paths.config;
export const configPath = (filename) => join(paths.config, filename);
