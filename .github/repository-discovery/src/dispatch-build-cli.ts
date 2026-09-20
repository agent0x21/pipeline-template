import fs from 'node:fs';
import path from 'node:path';
import type { AffectedManifest } from './types.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const manifestPath = value('--affected');
const repository = value('--repository');
const ref = value('--ref');
const sourceSha = value('--source-sha');
const discoveryRunId = value('--discovery-run-id');
const workflow = value('--workflow');
const publishContainers = value('--publish-containers') ?? 'false';
const token = process.env.GITHUB_TOKEN;
if (!manifestPath || !repository || !ref || !sourceSha || !discoveryRunId || !workflow || !token || !['true', 'false'].includes(publishContainers)) {
  throw new Error('dispatch-build requires affected, repository, ref, source-sha, discovery-run-id, workflow, publish-containers (true or false), and GITHUB_TOKEN.');
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8')) as AffectedManifest;
if (manifest.affectedApplications.length === 0) {
  process.stdout.write('No affected applications; build-and-test workflow was not dispatched.\n');
} else {
  const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const response = await fetch(`${apiUrl}/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, inputs: { source_sha: sourceSha, discovery_run_id: discoveryRunId, publish_containers: publishContainers } }),
  });
  if (!response.ok) throw new Error(`Build workflow dispatch failed (${response.status}).`);
  process.stdout.write(`Dispatched build-and-test workflow for ${manifest.affectedApplications.length} application(s).\n`);
}
