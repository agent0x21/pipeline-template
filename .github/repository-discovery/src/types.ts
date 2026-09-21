export type Platform = 'any' | 'windows';
export type ProjectType = 'react' | 'dotnet';

export interface BuildRequirements {
  platform: Platform;
  tools: string[];
}

export interface Application {
  /**
   * Stable, container-safe identifier used for tags, artifacts, and images.
   * It is normally derived from the application's directory name.
   */
  id: string;
  name: string;
  /**
   * The path-derived identifier used by pipeline versions before directory-based
   * names were introduced. It is retained only to read existing tag history.
   */
  legacyId?: string;
  path: string;
  ecosystem: 'node' | 'dotnet';
  type: ProjectType;
  subtype: string;
  projectSystem: 'npm' | 'sdk-style' | 'legacy-msbuild';
  targetFrameworks: string[];
  buildRequirements: BuildRequirements;
  files: string[];
  /** Repository-relative Dockerfile located in this application's directory, if present. */
  dockerfile: string;
  /** Explicit per-project CI/CD setting, when one was supplied. */
  cicd?: boolean;
}

export interface DiscoveryManifest {
  schemaVersion: 1;
  generatedBy: 'polyglot-repository-discovery';
  applications: Application[];
}

export interface DependencyGraph {
  schemaVersion: 1;
  generatedBy: 'polyglot-repository-discovery';
  applications: Application[];
  /** Directed edges: application or package node -> the nodes it consumes. */
  dependencies: Record<string, string[]>;
  /** Repository-relative directory ownership, used to map changed files to nodes. */
  owners: Record<string, string>;
}

export type AffectReason = 'direct-file-change' | 'dependency-change' | 'full-validation';

export interface AffectedApplication {
  id: string;
  reason: AffectReason;
  changedFiles: string[];
}

export interface AffectedManifest {
  schemaVersion: 1;
  generatedBy: 'polyglot-repository-discovery';
  base: string;
  head: string;
  changedFiles: string[];
  affectedApplications: AffectedApplication[];
}

export interface DetectorContext {
  root: string;
  files: string[];
}

export interface Detector {
  detect(context: DetectorContext): Application[];
}
