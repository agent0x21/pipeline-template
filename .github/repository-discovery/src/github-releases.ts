export interface ReleaseAsset { id: number; name: string; url: string; }
export interface Release { id: number; tag_name: string; upload_url: string; assets: ReleaseAsset[]; }

export interface GitHubReleasesConfig {
  apiUrl: string;
  repository: string;
  token: string;
}

function authHeaders(config: GitHubReleasesConfig): Record<string, string> {
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`, 'X-GitHub-Api-Version': '2022-11-28' };
}

/** The release for a tag, or undefined if none exists yet (a 404, not an error — this is the normal "first time" case). */
export async function findReleaseByTag(config: GitHubReleasesConfig, tag: string): Promise<Release | undefined> {
  const response = await fetch(`${config.apiUrl}/repos/${config.repository}/releases/tags/${encodeURIComponent(tag)}`, { headers: authHeaders(config) });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Failed to look up release for tag "${tag}" (${response.status}): ${await response.text()}`);
  return response.json() as Promise<Release>;
}

/**
 * Creates a release for `tag`, pointed at `targetCommitish` — the release
 * IS the tag: GitHub creates the underlying git tag automatically as part of
 * this call if it doesn't already exist, so nothing else needs to `git tag` /
 * `git push` separately.
 */
export async function createRelease(
  config: GitHubReleasesConfig,
  tag: string,
  targetCommitish: string,
  name: string,
  prerelease = false,
): Promise<Release> {
  const response = await fetch(`${config.apiUrl}/repos/${config.repository}/releases`, {
    method: 'POST',
    headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, target_commitish: targetCommitish, name, prerelease, generate_release_notes: false }),
  });
  if (!response.ok) throw new Error(`Failed to create release "${tag}" (${response.status}): ${await response.text()}`);
  return response.json() as Promise<Release>;
}

/** Replaces the Markdown body of an existing release without altering its tag or assets. */
export async function updateReleaseBody(config: GitHubReleasesConfig, releaseId: number, body: string): Promise<void> {
  const response = await fetch(`${config.apiUrl}/repos/${config.repository}/releases/${releaseId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(`Failed to update release ${releaseId} (${response.status}): ${await response.text()}`);
}

async function deleteAsset(config: GitHubReleasesConfig, assetId: number): Promise<void> {
  const response = await fetch(`${config.apiUrl}/repos/${config.repository}/releases/assets/${assetId}`, { method: 'DELETE', headers: authHeaders(config) });
  if (!response.ok && response.status !== 404) throw new Error(`Failed to delete existing asset ${assetId} (${response.status}): ${await response.text()}`);
}

/** Uploads `data` as an asset named `assetName` on `release`, replacing any existing asset of that name (so re-publishing the same app+version is idempotent). */
export async function uploadAsset(config: GitHubReleasesConfig, release: Release, assetName: string, data: Buffer, contentType: string): Promise<void> {
  const existing = release.assets.find((asset) => asset.name === assetName);
  if (existing) await deleteAsset(config, existing.id);
  const uploadUrl = `${release.upload_url.replace(/\{.*\}$/, '')}?name=${encodeURIComponent(assetName)}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': contentType },
    body: new Uint8Array(data),
  });
  if (!response.ok) throw new Error(`Failed to upload asset "${assetName}" (${response.status}): ${await response.text()}`);
}

/** Downloads an asset's raw bytes. Authorization is stripped automatically on the redirect to GitHub's storage host, per the fetch spec, so this works for private repos without extra handling. */
export async function downloadAsset(config: GitHubReleasesConfig, asset: ReleaseAsset): Promise<Buffer> {
  const response = await fetch(asset.url, { headers: { ...authHeaders(config), Accept: 'application/octet-stream' } });
  if (!response.ok) throw new Error(`Failed to download asset "${asset.name}" (${response.status}): ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}
