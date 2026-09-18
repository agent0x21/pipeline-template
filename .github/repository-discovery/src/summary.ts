import fs from 'node:fs';
import type { DiscoveryManifest } from './types.js';

function markdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

export function renderSummary(data: DiscoveryManifest): string {
  const applications = data.applications.map((application) =>
    `| ${markdownCell(application.name)} | ${markdownCell(application.path || '.')} | ${application.ecosystem} | ${application.subtype} | ${application.projectSystem} | ${markdownCell(application.targetFrameworks.join(', ') || '—')} | ${application.buildRequirements.platform} | ${markdownCell(application.buildRequirements.tools.join(', '))} | ${markdownCell(application.files.join(', '))} |`,
  ).join('\n');

  return `# Repository discovery\n\nDiscovered **${data.applications.length} application(s)**.\n\n## Applications\n\n| Name | Path | Ecosystem | Subtype | Project system | Target framework(s) | Platform | Tools | Files |\n|---|---|---|---|---|---|---|---|---|\n${applications || '| — | — | — | — | — | — | — | — | — |'}\n`;
}

export function publishSummary(manifestPath: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) throw new Error('GITHUB_STEP_SUMMARY is not available; this command must run in GitHub Actions.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DiscoveryManifest;
  fs.appendFileSync(summaryPath, renderSummary(manifest));
}
