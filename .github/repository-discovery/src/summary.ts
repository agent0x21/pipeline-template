import fs from 'node:fs';
import type { AutoRcCandidate } from './auto-rc.js';
import type { AffectedManifest, DiscoveryManifest } from './types.js';

function markdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function runIdLine(runId: string | undefined): string {
  return runId ? `**Workflow run ID:** \`${runId}\`\n\n` : '';
}

export function renderSummary(data: DiscoveryManifest, runId?: string): string {
  const applications = data.applications.map((application) =>
    `| ${markdownCell(application.name)} | ${markdownCell(application.id)} | ${markdownCell(application.path || '.')} | ${application.ecosystem} | ${application.subtype} | ${application.projectSystem} | ${markdownCell(application.targetFrameworks.join(', ') || '—')} | ${application.buildRequirements.platform} | ${markdownCell(application.buildRequirements.tools.join(', '))} | ${markdownCell(application.files.join(', '))} |`,
  ).join('\n');

  return `# Repository discovery\n\n${runIdLine(runId)}Discovered **${data.applications.length} application(s)**.\n\n## Applications\n\n| Name | ID | Path | Ecosystem | Subtype | Project system | Target framework(s) | Platform | Tools | Files |\n|---|---|---|---|---|---|---|---|---|---|\n${applications || '| — | — | — | — | — | — | — | — | — | — |'}\n`;
}

export function publishSummary(manifestPath: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) throw new Error('GITHUB_STEP_SUMMARY is not available; this command must run in GitHub Actions.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DiscoveryManifest;
  fs.appendFileSync(summaryPath, renderSummary(manifest, process.env.GITHUB_RUN_ID));
}

export function renderAffectedSummary(data: AffectedManifest, runId?: string): string {
  const rows = data.affectedApplications.map((application) =>
    `| ${markdownCell(application.id)} | ${application.reason === 'direct-file-change' ? 'Direct file change' : application.reason === 'dependency-change' ? 'Dependency change' : 'Full validation'} | ${markdownCell(application.changedFiles.join(', ') || '—')} |`,
  ).join('\n');
  const fullValidation = data.affectedApplications.some((application) => application.reason === 'full-validation');
  const context = fullValidation
    ? `Full validation selected **${data.affectedApplications.length} application(s)** for rebuild and testing.`
    : `Compared \`${data.base}\` → \`${data.head}\`, **${data.affectedApplications.length} application(s)** require rebuild and versioning.`;
  return `## Applications to rebuild and version\n\n${runIdLine(runId)}${context}\n\n| Application | Reason | Directly changed file(s) |\n|---|---|---|\n${rows || '| — | No affected applications | — |'}\n`;
}

export function publishAffectedSummary(manifestPath: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) throw new Error('GITHUB_STEP_SUMMARY is not available; this command must run in GitHub Actions.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AffectedManifest;
  fs.appendFileSync(summaryPath, renderAffectedSummary(manifest, process.env.GITHUB_RUN_ID));
}

function autoRcReasonLabel(reason: AutoRcCandidate['reason']): string {
  if (reason === 'first-rc') return 'First release candidate';
  if (reason === 'direct-file-change') return 'Direct file change';
  if (reason === 'dependency-change') return 'Dependency change';
  return reason;
}

export function renderAutoRcSummary(candidates: AutoRcCandidate[], runId?: string): string {
  const rows = candidates
    .map(({ application, reason }) => `| ${markdownCell(application.name)} | ${markdownCell(application.id)} | ${markdownCell(application.path || '.')} | ${application.ecosystem} | ${autoRcReasonLabel(reason)} |`)
    .join('\n');
  const context = candidates.length
    ? `**${candidates.length} application(s)** changed since their own last release candidate and will get a new one.`
    : 'No applications have changed since their own last release candidate; nothing to do.';
  const next = candidates.length
    ? 'A release-candidate build will run independently for each listed application.'
    : 'No release-candidate builds will be started.';
  return `# Automatic release candidates\n\n${runIdLine(runId)}${context}\n\n## Selected applications\n\n| Application | ID | Path | Ecosystem | Reason |\n|---|---|---|---|---|\n${rows || '| — | — | — | — | — |'}\n\n## Next\n\n${next}\n`;
}

export function publishAutoRcSummary(candidates: AutoRcCandidate[]): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) throw new Error('GITHUB_STEP_SUMMARY is not available; this command must run in GitHub Actions.');
  fs.appendFileSync(summaryPath, renderAutoRcSummary(candidates, process.env.GITHUB_RUN_ID));
}
