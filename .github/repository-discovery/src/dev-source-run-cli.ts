import fs from 'node:fs';

interface Workflow { id: number; path: string; }
interface WorkflowRun {
  conclusion: string | null;
  display_title?: string;
  event: string;
  head_branch: string | null;
  head_sha: string;
  workflow_id: number;
}

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const repository = value('--repository');
const runId = value('--run-id');
const workflowPath = value('--workflow');
const runNamePrefix = value('--run-name-prefix');
const token = process.env.GITHUB_TOKEN;
const output = process.env.GITHUB_OUTPUT;
if (!repository || !runId || !workflowPath || !runNamePrefix || !token || !output) {
  throw new Error('validate-dev-source-run requires repository, run-id, workflow, run-name-prefix, GITHUB_TOKEN, and GITHUB_OUTPUT.');
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

const run = await getJson<WorkflowRun>(`/actions/runs/${encodeURIComponent(runId)}`);
if (run.workflow_id !== workflow.id) throw new Error(`Workflow run ${runId} is not a ${workflowPath} run.`);
if (run.event !== 'push') throw new Error(`Workflow run ${runId} was triggered by ${run.event}, not a branch push.`);
if (run.conclusion !== 'success') throw new Error(`Workflow run ${runId} did not succeed (conclusion: ${run.conclusion ?? 'in progress'}).`);
if (!run.head_branch || run.head_branch === 'main') throw new Error(`Workflow run ${runId} must be a successful non-main branch push.`);
if (!run.display_title?.startsWith(runNamePrefix)) throw new Error(`Workflow run ${runId} predates the integrated branch-validation workflow and cannot be used for dev artifacts.`);

const branchSlug = run.head_branch
  .toLowerCase()
  .replace(/[^a-z0-9_.-]+/g, '-')
  .replace(/^[.-]+|[.-]+$/g, '') || 'branch';
const maxBranchLength = Math.max(1, 128 - `dev--${run.head_sha}`.length);
const imageTag = `dev-${branchSlug.slice(0, maxBranchLength)}-${run.head_sha}`;
fs.appendFileSync(output, `source_sha=${run.head_sha}\nsource_branch=${run.head_branch}\nsource_run_id=${runId}\ndev_image_tag=${imageTag}\n`);
