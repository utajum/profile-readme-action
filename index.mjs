import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { client } from './src/github.mjs';
import { contrib3dSvg } from './src/contrib3d.mjs';
import { activitySvg } from './src/activity.mjs';
import { statsSection } from './src/stats.mjs';

const input = (name, fallback = '') => (process.env[`INPUT_${name.toUpperCase()}`] || '').trim() || fallback;
const log = (...a) => console.log(...a);

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  log(`wrote ${path}`);
}

async function main() {
  const token = input('token');
  const login = process.env.GITHUB_REPOSITORY_OWNER;
  if (!token) throw new Error('token is empty');
  if (!login) throw new Error('GITHUB_REPOSITORY_OWNER is empty');
  const gh = client(token);

  write('profile-3d-contrib/profile-night-rainbow.svg', await contrib3dSvg(gh, login));
  write('profile/activity-graph.svg', await activitySvg(gh, login));

  // GITHUB_TOKEN cannot see private repos, so keep the last stats
  if (token.startsWith('ghs_')) {
    log('::warning::README stats skipped: set a PAT with repo scope as token');
    return;
  }
  const section = await statsSection(gh, login, input('timezone', 'UTC'), log);
  const src = readFileSync('README.md', 'utf8');
  const out = src.replace(/<!--START_SECTION:waka-->[\s\S]*?<!--END_SECTION:waka-->/, () => section);
  if (out === src) throw new Error('README.md: waka section markers not found');
  write('README.md', out);
}

main().catch((e) => {
  console.log(`::error::${e.message}`);
  process.exit(1);
});
