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

/**
 * Reads simple MSBuild property values without depending on an XML library. It
 * compares local element names, so both the SDK-style form and the legacy
 * default MSBuild namespace (and prefixed namespaces) are handled alike.
 */
export function xmlPropertyValues(xml: string, propertyName: string): string[] {
  const values: string[] = [];
  const stack: Array<{ name: string; text: string }> = [];
  let cursor = 0;

  while (cursor < xml.length) {
    const nextTag = xml.indexOf('<', cursor);
    if (nextTag < 0) {
      if (stack.length) stack[stack.length - 1].text += xml.slice(cursor);
      break;
    }
    if (stack.length) stack[stack.length - 1].text += xml.slice(cursor, nextTag);
    if (xml.startsWith('<!--', nextTag)) {
      const end = xml.indexOf('-->', nextTag + 4);
      cursor = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', nextTag)) {
      const end = xml.indexOf(']]>', nextTag + 9);
      const text = xml.slice(nextTag + 9, end < 0 ? xml.length : end);
      if (stack.length) stack[stack.length - 1].text += text;
      cursor = end < 0 ? xml.length : end + 3;
      continue;
    }
    const end = xml.indexOf('>', nextTag + 1);
    if (end < 0) break;
    const token = xml.slice(nextTag + 1, end).trim();
    cursor = end + 1;
    if (!token || token.startsWith('?') || token.startsWith('!')) continue;
    if (token.startsWith('/')) {
      const element = stack.pop();
      if (element?.name.toLowerCase() === propertyName.toLowerCase()) values.push(element.text.trim());
      continue;
    }
    const separator = token.search(/[\s/]/);
    const name = token.slice(0, separator < 0 ? undefined : separator);
    if (!name) continue;
    const localName = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
    if (token.endsWith('/')) continue;
    stack.push({ name: localName, text: '' });
  }
  return values.filter(Boolean);
}

export function cicdSetting(values: string[], source: string): boolean | undefined {
  if (!values.length) return undefined;
  const normalized = values.map((value) => value.trim().toLowerCase());
  if (normalized.some((value) => value !== 'true' && value !== 'false') || new Set(normalized).size !== 1) {
    process.stderr.write(`Warning: ignoring invalid or conflicting cicd setting in ${source}; preserving automatic discovery.\n`);
    return undefined;
  }
  return normalized[0] === 'true';
}

export function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}
