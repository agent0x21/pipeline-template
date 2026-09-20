import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

interface Workflow { id: number; path: string; }
interface WorkflowRun { head_sha: string; conclusion: string | null; display_title?: string; }

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const repository = value('--repository');
const branch = value('--branch');
const head = value('--head');
const workflowPath = value('--workflow');
const runNamePrefix = value('--run-name-prefix');
const root = path.resolve(value('--root') ?? '.');
const token = process.env.GITHUB_TOKEN;
const output = process.env.GITHUB_OUTPUT;
if (!repository || !branch || !head || !workflowPath || !token || !output) {
  throw new Error('resolve-baseline requires repository, branch, head, workflow, GITHUB_TOKEN, and GITHUB_OUTPUT.');
}

const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
async function getJson<T>(requestPath: string): Promise<T> {
  const response = await fetch(`${apiUrl}/repos/${repository}${requestPath}`, { headers });
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status}): ${requestPath}`);
  return response.json() as Promise<T>;
}

const workflows = await getJson<{ workflows: Workflow[] }>('/actions/workflows?per_page=100');
const workflow = workflows.workflows.find((item) => item.path === workflowPath || item.path.endsWith(`/${workflowPath}`));
if (!workflow) throw new Error(`Workflow not found: ${workflowPath}`);

let base: string | undefined;
for (let page = 1; page <= 10 && !base; page += 1) {
  const runs = await getJson<{ workflow_runs: WorkflowRun[] }>(`/actions/workflows/${workflow.id}/runs?branch=${encodeURIComponent(branch)}&per_page=100&page=${page}`);
  base = runs.workflow_runs.find((run) => run.conclusion === 'success' && (!runNamePrefix || run.display_title?.startsWith(runNamePrefix)))?.head_sha;
  if (runs.workflow_runs.length < 100) break;
}

const isAncestor = base && spawnSync('git', ['merge-base', '--is-ancestor', base, head], { cwd: root }).status === 0;
const mode = isAncestor ? 'affected' : 'full';
fs.appendFileSync(output, `base=${isAncestor ? base : ''}\nmode=${mode}\n`);
