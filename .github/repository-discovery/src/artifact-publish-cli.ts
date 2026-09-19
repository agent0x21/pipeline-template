import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRelease, findReleaseByTag, uploadAsset, type GitHubReleasesConfig } from './github-releases.js';
import { tagPrefix } from './version.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const appId = value('--app-id');
const version = value('--version');
const appDirectory = value('--app-directory');
const ref = value('--ref');
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!appId || !version || !appDirectory || !ref) throw new Error('artifact-publish requires --app-id, --version, --app-directory, and --ref.');
if (!repository || !token) throw new Error('artifact-publish requires GITHUB_REPOSITORY and GITHUB_TOKEN; this command must run in GitHub Actions.');

const config: GitHubReleasesConfig = { apiUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com', repository, token };
const tag = `${tagPrefix(appId)}${version}`;
const assetName = `${appId}-${version}.tar.gz`;

const archivePath = path.join(os.tmpdir(), assetName);
if (fs.existsSync(archivePath)) fs.rmSync(archivePath);
// tar ships on both Windows 10+ (bsdtar, on PATH by default) and Linux, so this
// needs no extra tool installed on the runner beyond what's already there.
execFileSync('tar', ['-czf', archivePath, '-C', appDirectory, '.']);

const release = (await findReleaseByTag(config, tag)) ?? (await createRelease(config, tag, ref, `${appId} ${version}`));
const data = fs.readFileSync(archivePath);
await uploadAsset(config, release, assetName, data, 'application/gzip');
fs.rmSync(archivePath);

console.log(`Published ${assetName} to release "${tag}" (target ${ref}).`);
