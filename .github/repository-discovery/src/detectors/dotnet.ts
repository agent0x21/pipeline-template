import fs from 'node:fs';
import path from 'node:path';
import type { Application, Detector, DetectorContext } from '../types.js';
import { cicdSetting, hasXmlValue, idFor, repoPath, uniqueSorted, xmlPropertyValues, xmlValues } from '../utils.js';

export class DotnetDetector implements Detector {
  detect({ root, files }: DetectorContext): Application[] {
    return files.filter((file) => /\.(csproj|fsproj|vbproj)$/i.test(file)).map((projectFile) => {
      const xml = fs.readFileSync(projectFile, 'utf8');
      const projectRelative = repoPath(root, projectFile);
      const appPath = path.posix.dirname(projectRelative);
      const sdkStyle = /<Project\b[^>]*\bSdk\s*=|<Sdk\b/i.test(xml);
      const isWpf = hasXmlValue(xml, 'UseWPF', 'true') || /Microsoft\.WindowsDesktop\.App\.WPF/i.test(xml);
      const isWinForms = hasXmlValue(xml, 'UseWindowsForms', 'true') || /System\.Windows\.Forms/i.test(xml);
      const isWeb = /Microsoft\.NET\.Sdk\.Web|Microsoft\.AspNetCore\.App|Microsoft\.WebApplication/i.test(xml);
      const classicAspNet = !sdkStyle && (files.some((f) => path.posix.dirname(repoPath(root, f)) === appPath && /(^|\/)web\.config$/i.test(repoPath(root, f))) || /System\.Web(\.|<)/i.test(xml));
      const subtype = isWpf ? 'wpf' : isWinForms ? 'winforms' : isWeb || classicAspNet ? (classicAspNet ? 'aspnet-framework' : 'web') : 'library-or-service';
      const windows = isWpf || isWinForms || classicAspNet || /net[0-4]\d|netstandard/i.test(xml) && !sdkStyle;
      const frameworks = uniqueSorted([...xmlValues(xml, 'TargetFramework'), ...xmlValues(xml, 'TargetFrameworks').flatMap((v) => v.split(';')), ...xmlValues(xml, 'TargetFrameworkVersion').map((v) => v.replace(/^v/i, 'net'))]);
      const related = files.filter((f) => path.posix.dirname(repoPath(root, f)) === appPath && /(^|\/)(packages\.config|web\.config)$/i.test(repoPath(root, f))).map((f) => repoPath(root, f));
      const dockerfile = files.map((file) => repoPath(root, file)).find((file) => path.posix.dirname(file) === appPath && path.posix.basename(file).toLowerCase() === 'dockerfile') ?? '';
      const cicd = cicdSetting(xmlPropertyValues(xml, 'cicd'), projectRelative);
      return { id: idFor(projectRelative), name: path.posix.basename(projectRelative, path.posix.extname(projectRelative)), path: appPath, ecosystem: 'dotnet', type: 'dotnet', subtype, projectSystem: sdkStyle ? 'sdk-style' : 'legacy-msbuild', targetFrameworks: frameworks, buildRequirements: { platform: windows ? 'windows' : 'any', tools: windows ? ['msbuild'] : ['dotnet'] }, files: uniqueSorted([projectRelative, ...related]), dockerfile, ...(cicd === undefined ? {} : { cicd }) };
    });
  }
}
