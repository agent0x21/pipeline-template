import path from 'node:path';

export function repoPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export function idFor(repoRelativePath: string): string {
  return repoRelativePath.replace(/\.[^.\/]+$/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export function xmlValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'gi'))]
    .map((match) => match[1].trim()).filter(Boolean);
}

export function hasXmlValue(xml: string, tag: string, value: string): boolean {
  return xmlValues(xml, tag).some((item) => item.toLowerCase() === value.toLowerCase());
}

export function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}
