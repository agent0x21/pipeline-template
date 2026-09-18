import path from 'node:path';
import { publishSummary } from './summary.js';

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: summary <manifest-path>');
publishSummary(path.resolve(manifestPath));
