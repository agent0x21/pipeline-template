import { describe, expect, it } from 'vitest';
import {
  bump,
  finalVersionFromRc,
  formatVersion,
  latestFinalVersion,
  latestRcNumber,
  nextRcVersion,
  parseFinalVersion,
  parseRcVersion,
  tagPrefix,
} from '../src/version.js';

describe('version parsing and formatting', () => {
  it('parses and formats final versions', () => {
    expect(parseFinalVersion('1.4.0')).toEqual({ major: 1, minor: 4, patch: 0 });
    expect(parseFinalVersion('1.4.0-rc.2')).toBeUndefined();
    expect(parseFinalVersion('not-a-version')).toBeUndefined();
    expect(formatVersion({ major: 1, minor: 4, patch: 0 })).toBe('1.4.0');
  });

  it('parses rc versions', () => {
    expect(parseRcVersion('1.5.0-rc.3')).toEqual({ major: 1, minor: 5, patch: 0, rc: 3 });
    expect(parseRcVersion('1.5.0')).toBeUndefined();
  });

  it('strips the rc suffix to get the promoted final version', () => {
    expect(finalVersionFromRc('1.5.0-rc.3')).toEqual({ target: { major: 1, minor: 5, patch: 0 }, version: '1.5.0' });
    expect(() => finalVersionFromRc('1.5.0')).toThrow();
  });
});

describe('bump', () => {
  const base = { major: 1, minor: 4, patch: 7 };
  it('bumps major, resetting minor and patch', () => expect(bump(base, 'major')).toEqual({ major: 2, minor: 0, patch: 0 }));
  it('bumps minor, resetting patch', () => expect(bump(base, 'minor')).toEqual({ major: 1, minor: 5, patch: 0 }));
  it('bumps patch only', () => expect(bump(base, 'patch')).toEqual({ major: 1, minor: 4, patch: 8 }));
});

describe('latestFinalVersion', () => {
  it('ignores other applications and rc tags, picks the highest final version', () => {
    const tags = ['portal/v1.0.0', 'portal/v1.4.0', 'portal/v1.4.0-rc.1', 'other-app/v9.9.9', 'portal/v1.2.0'];
    expect(latestFinalVersion('portal', tags)).toEqual({ major: 1, minor: 4, patch: 0 });
  });

  it('returns undefined when the application has never been tagged', () => {
    expect(latestFinalVersion('portal', ['other-app/v1.0.0'])).toBeUndefined();
  });
});

describe('latestRcNumber', () => {
  it('finds the highest rc for the exact target version only', () => {
    const tags = ['portal/v1.5.0-rc.1', 'portal/v1.5.0-rc.2', 'portal/v1.6.0-rc.1', 'other-app/v1.5.0-rc.9'];
    expect(latestRcNumber('portal', { major: 1, minor: 5, patch: 0 }, tags)).toBe(2);
  });

  it('returns undefined when no rc series exists yet for that target', () => {
    expect(latestRcNumber('portal', { major: 2, minor: 0, patch: 0 }, [])).toBeUndefined();
  });
});

describe('nextRcVersion', () => {
  it('seeds 0.1.0 by default when the application has never been versioned', () => {
    const result = nextRcVersion('portal', [], { bumpLevel: 'minor' });
    expect(result).toEqual({ target: { major: 0, minor: 1, patch: 0 }, rc: 1, version: '0.1.0-rc.1', tag: 'portal/v0.1.0-rc.1' });
  });

  it('honors an explicit initial version instead of 0.1.0', () => {
    const result = nextRcVersion('portal', [], { bumpLevel: 'minor', initialVersion: '3.0.0' });
    expect(result.target).toEqual({ major: 3, minor: 0, patch: 0 });
    expect(result.version).toBe('3.0.0-rc.1');
  });

  it('bumps from the latest FINAL version, never from an outstanding rc', () => {
    // Latest final is 1.4.0; an abandoned 1.4.1-rc.1 for a patch attempt must not
    // influence a later minor-bump request.
    const tags = ['portal/v1.4.0', 'portal/v1.4.1-rc.1'];
    const result = nextRcVersion('portal', tags, { bumpLevel: 'minor' });
    expect(result.target).toEqual({ major: 1, minor: 5, patch: 0 });
    expect(result.version).toBe('1.5.0-rc.1');
  });

  it('continues an existing rc series for the same computed target instead of restarting at rc.1', () => {
    const tags = ['portal/v1.4.0', 'portal/v1.5.0-rc.1', 'portal/v1.5.0-rc.2'];
    const result = nextRcVersion('portal', tags, { bumpLevel: 'minor' });
    expect(result.version).toBe('1.5.0-rc.3');
  });

  it('continues version history from the prior path-derived ID but writes the new tag with the friendly ID', () => {
    const result = nextRcVersion('api', ['apps-api-dotnetwebapi-api/v0.1.0', 'apps-api-dotnetwebapi-api/v0.2.0-rc.1'], { bumpLevel: 'minor' }, ['apps-api-dotnetwebapi-api']);
    expect(result).toMatchObject({ version: '0.2.0-rc.2', tag: 'api/v0.2.0-rc.2' });
  });

  it('respects an explicit major or patch bump override', () => {
    const tags = ['portal/v1.4.0'];
    expect(nextRcVersion('portal', tags, { bumpLevel: 'major' }).target).toEqual({ major: 2, minor: 0, patch: 0 });
    expect(nextRcVersion('portal', tags, { bumpLevel: 'patch' }).target).toEqual({ major: 1, minor: 4, patch: 1 });
  });
});

describe('tagPrefix', () => {
  it('namespaces tags per application id', () => expect(tagPrefix('portal')).toBe('portal/v'));
});
