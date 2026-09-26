#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

delete process.env.npm_config_allow_scripts;
delete process.env.NPM_CONFIG_ALLOW_SCRIPTS;

process.exit(
  spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['audit', ...process.argv.slice(2)],
    { stdio: 'inherit' }
  ).status ?? 0
);
