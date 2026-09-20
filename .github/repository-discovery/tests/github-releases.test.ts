import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelease, downloadAsset, findReleaseByTag, updateReleaseBody, uploadAsset, type GitHubReleasesConfig, type Release } from '../src/github-releases.js';

const config: GitHubReleasesConfig = { apiUrl: 'https://api.example.test', repository: 'owner/repo', token: 'test-token' };
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findReleaseByTag', () => {
  it('returns the release when the tag has one', async () => {
    const release = { id: 1, tag_name: 'portal/v1.0.0', upload_url: 'https://uploads.example.test/1{?name}', assets: [] };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => release });
    const result = await findReleaseByTag(config, 'portal/v1.0.0');
    expect(result).toEqual(release);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/repos/owner/repo/releases/tags/portal%2Fv1.0.0',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    );
  });

  it('returns undefined on a 404 — no release yet is the normal first-time case, not an error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found' });
    expect(await findReleaseByTag(config, 'portal/v1.0.0')).toBeUndefined();
  });

  it('throws on any other failure status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' });
    await expect(findReleaseByTag(config, 'portal/v1.0.0')).rejects.toThrow(/500/);
  });
});

describe('createRelease', () => {
  it('creates a release at the given target commit, which also creates the underlying git tag', async () => {
    const created = { id: 2, tag_name: 'portal/v1.1.0', upload_url: 'https://uploads.example.test/2{?name}', assets: [] };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => created });
    const result = await createRelease(config, 'portal/v1.1.0', 'abc123', 'portal 1.1.0');
    expect(result).toEqual(created);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ tag_name: 'portal/v1.1.0', target_commitish: 'abc123', name: 'portal 1.1.0', prerelease: false, generate_release_notes: false });
  });

  it('marks the release as a prerelease when requested', async () => {
    const created = { id: 2, tag_name: 'portal/v1.1.0-rc.1', upload_url: 'https://uploads.example.test/2{?name}', assets: [] };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => created });
    await createRelease(config, 'portal/v1.1.0-rc.1', 'abc123', 'portal 1.1.0-rc.1', true);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ prerelease: true });
  });

  it('throws with the response body on failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'tag already exists' });
    await expect(createRelease(config, 'portal/v1.1.0', 'abc123', 'portal 1.1.0')).rejects.toThrow(/tag already exists/);
  });
});

describe('uploadAsset', () => {
  const release: Release = { id: 5, tag_name: 'portal/v1.0.0', upload_url: 'https://uploads.example.test/5{?name,label}', assets: [] };

  it('posts to the upload_url with the name query param, stripping its URI template', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await uploadAsset(config, release, 'portal-1.0.0.tar.gz', Buffer.from('data'), 'application/gzip');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://uploads.example.test/5?name=portal-1.0.0.tar.gz',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Content-Type': 'application/gzip' }) }),
    );
  });

  it('deletes a same-named existing asset first, so re-publishing the same app+version is idempotent', async () => {
    const withAsset: Release = { ...release, assets: [{ id: 99, name: 'portal-1.0.0.tar.gz', url: 'https://api.example.test/assets/99' }] };
    fetchMock.mockResolvedValueOnce({ ok: true }); // delete
    fetchMock.mockResolvedValueOnce({ ok: true }); // upload
    await uploadAsset(config, withAsset, 'portal-1.0.0.tar.gz', Buffer.from('data'), 'application/gzip');
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.example.test/repos/owner/repo/releases/assets/99', expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('updateReleaseBody', () => {
  it('replaces the existing release body without changing its tag or assets', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await updateReleaseBody(config, 5, '# Environment manifest');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/repos/owner/repo/releases/5',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ body: '# Environment manifest' }) }),
    );
  });
});

describe('downloadAsset', () => {
  it('fetches the asset URL with an octet-stream accept header and returns the bytes', async () => {
    const asset = { id: 7, name: 'portal-1.0.0.tar.gz', url: 'https://api.example.test/assets/7' };
    fetchMock.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new TextEncoder().encode('bytes').buffer });
    const result = await downloadAsset(config, asset);
    expect(result).toEqual(Buffer.from('bytes'));
    expect(fetchMock).toHaveBeenCalledWith(asset.url, expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/octet-stream' }) }));
  });
});
