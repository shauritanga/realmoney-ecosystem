const fs = require('fs');
const path = require('path');

const targets = ['dist/esm', 'dist/cjs', 'dist/types'];
const pairs = [
  ['Grid2x2CheckIcon', 'Grid2X2CheckIcon'],
  ['Grid2x2PlusIcon', 'Grid2X2PlusIcon'],
  ['Grid2x2Icon', 'Grid2X2Icon'],
  ['Grid2x2XIcon', 'Grid2X2XIcon'],
  ['Grid3x2Icon', 'Grid3X2Icon'],
  ['Grid3x3Icon', 'Grid3X3Icon'],
];

for (const sub of targets) {
  const dir = path.join(__dirname, 'node_modules/@hugeicons/core-free-icons', sub);
  if (!fs.existsSync(dir)) continue;
  const ext = sub === 'dist/types' ? '.d.ts' : '.js';
  for (const [lower, upper] of pairs) {
    const src = path.join(dir, upper + ext);
    const dst = path.join(dir, lower + ext);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      try {
        fs.symlinkSync(upper + ext, dst);
      } catch {
        fs.copyFileSync(src, dst);
      }
    }
  }
}
