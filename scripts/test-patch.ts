import { parsePatchBlocks, extractSummary, applyPatches } from '../lib/patch';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const html = fs.readFileSync(path.join(os.tmpdir(), 'test-lesson.html'), 'utf8');
const out = fs.readFileSync(path.join(os.tmpdir(), 'test-chat-out.txt'), 'utf8');

const blocks = parsePatchBlocks(out);
console.log('blocks parsed:', blocks ? blocks.length : 'null');
console.log('summary:', extractSummary(out));

if (blocks) {
  const result = applyPatches(html, blocks);
  console.log('applied:', result.applied, 'failed:', result.failed.length);
  console.log('still complete doc:', /<\/html>\s*$/.test(result.html.trimEnd()));
  console.log('new heading present:', result.html.includes('Why Derivatives Matter'));
  console.log('length:', html.length, '->', result.html.length);
  if (result.failed.length > 0) {
    console.log('failure details:', JSON.stringify(result.failed, null, 2));
    console.log('search snippet was:', JSON.stringify(blocks[result.failed[0].index]?.search));
  }
}
