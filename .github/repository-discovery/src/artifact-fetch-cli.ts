import fs from 'node:fs';
import path from 'node:path';
import { extractZip } from './archive.js';
import { downloadAsset, findReleaseByTag, type GitHubReleasesConfig } from './github-releases.js';
import { tagPrefix } from './version.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const appId = value('--app-id');
const version = value('--version');
const destination = value('--destination');
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!appId || !version || !destination) throw new Error('artifact-fetch requires --app-id, --version, and --destination.');
if (!repository || !token) throw new Error('artifact-fetch requires GITHUB_REPOSITORY and GITHUB_TOKEN; this command must run in GitHub Actions.');

const config: GitHubReleasesConfig = { apiUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com', repository, token };
const tag = `${tagPrefix(appId)}${version}`;
const assetName = `${appId}-${version}.zip`;

const release = await findReleaseByTag(config, tag);
if (!release) throw new Error(`No release found for tag "${tag}". It must have been published (via artifact-publish-cli) before it can be fetched.`);
const asset = release.assets.find((item) => item.name === assetName);
if (!asset) throw new Error(`Release "${tag}" has no asset named "${assetName}".`);

fs.mkdirSync(destination, { recursive: true });
const archivePath = path.join(destination, assetName);
fs.writeFileSync(archivePath, await downloadAsset(config, asset));
extractZip(archivePath, destination);
fs.rmSync(archivePath);

console.log(`Fetched ${assetName} from release "${tag}" into ${destination}.`);
