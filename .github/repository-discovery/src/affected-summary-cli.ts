import path from 'node:path';
import { publishAffectedSummary } from './summary.js';

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: affected-summary <affected-manifest-path>');
publishAffectedSummary(path.resolve(manifestPath));
