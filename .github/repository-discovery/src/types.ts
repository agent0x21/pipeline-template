export type Platform = 'any' | 'windows';
export type ProjectType = 'react' | 'dotnet';

export interface BuildRequirements {
  platform: Platform;
  tools: string[];
}

export interface Application {
  id: string;
  name: string;
  path: string;
  ecosystem: 'node' | 'dotnet';
  type: ProjectType;
  subtype: string;
  projectSystem: 'npm' | 'sdk-style' | 'legacy-msbuild';
  targetFrameworks: string[];
  buildRequirements: BuildRequirements;
  files: string[];
}

export interface DiscoveryManifest {
  schemaVersion: 1;
  generatedBy: 'polyglot-repository-discovery';
  applications: Application[];
}

export interface DetectorContext {
  root: string;
  files: string[];
}

export interface Detector {
  detect(context: DetectorContext): Application[];
}
