import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist');
const staging = await mkdtemp(join(root, '.build-'));
const next = join(staging, 'next'),
  previous = join(staging, 'previous');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 12);
try {
  await mkdir(next);
  const [
    {
      outputFiles: [script],
    },
    css,
    template,
  ] = await Promise.all([
    build({
      entryPoints: [join(root, 'src/main.js')],
      bundle: true,
      format: 'iife',
      target: 'es2020',
      minify: true,
      legalComments: 'none',
      charset: 'utf8',
      write: false,
    }),
    readFile(join(root, 'src/style.css')),
    readFile(join(root, 'src/index.html'), 'utf8'),
  ]);
  const scriptName = 'game-' + hash(script.contents) + '.js',
    styleName = 'style-' + hash(css) + '.css';
  await Promise.all([
    cp(join(root, 'public/assets'), join(next, 'assets'), { recursive: true }),
    writeFile(join(next, scriptName), script.contents),
    writeFile(join(next, styleName), css),
    writeFile(
      join(next, 'index.html'),
      template
        .replace('src="game.js"', 'src="' + scriptName + '"')
        .replace('href="style.css"', 'href="' + styleName + '"'),
    ),
    writeFile(join(next, '.nojekyll'), ''),
  ]);
  // A failed compile leaves the last playable build available.
  let backedUp = false;
  try {
    await rename(output, previous);
    backedUp = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await rename(next, output);
  } catch (error) {
    if (backedUp) await rename(previous, output);
    throw error;
  }
  console.log('dist ready · ' + scriptName + ' · ' + script.contents.length + ' bytes of game JavaScript');
} finally {
  await rm(staging, { recursive: true, force: true });
}
