import { execFileSync } from 'node:child_process';

const options = { stdio: 'inherit' };
execFileSync('git', ['diff', '--check', 'HEAD'], options);
execFileSync('git', ['show', '--format=', '--check', 'HEAD'], options);
const base = process.env.CHECK_BASE;
if (base && !/^0+$/.test(base)) execFileSync('git', ['diff', '--check', `${base}...HEAD`], options);
