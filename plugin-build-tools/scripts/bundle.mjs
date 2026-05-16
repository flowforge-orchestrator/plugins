#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const helpDst = join(dist, 'help.md');

function readPackageJson(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

function findFirstHelpMd(dir) {
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const found = findFirstHelpMd(p);
      if (found) return found;
    } else if (e.isFile() && e.name === 'help.md') {
      return p;
    }
  }
  return null;
}

function materializeHelpMarkdown(strategy) {
  if (strategy === 'empty') {
    writeFileSync(helpDst, '', 'utf8');
    return;
  }
  if (strategy === 'firstInDist') {
    const helpSrc = findFirstHelpMd(dist);
    if (helpSrc) {
      copyFileSync(helpSrc, helpDst);
    } else {
      writeFileSync(helpDst, '', 'utf8');
    }
    return;
  }
  if (strategy && typeof strategy === 'object' && typeof strategy.distRelativePath === 'string') {
    const helpSrc = join(dist, strategy.distRelativePath);
    if (existsSync(helpSrc)) {
      copyFileSync(helpSrc, helpDst);
    } else {
      writeFileSync(helpDst, '', 'utf8');
    }
    return;
  }
  throw new Error(
    `flowforgePluginBuild.helpMarkdown must be "empty", "firstInDist", or { "distRelativePath": "..." } (got ${JSON.stringify(strategy)})`,
  );
}

const pkg = readPackageJson(root);
const cfg = pkg.flowforgePluginBuild;
if (!cfg?.helpMarkdown) {
  throw new Error(`Missing flowforgePluginBuild.helpMarkdown in ${join(root, 'package.json')}`);
}
const helpMarkdown = cfg.helpMarkdown;
const bundleMarkdownAsText = Boolean(cfg.bundleMarkdownAsText);

materializeHelpMarkdown(helpMarkdown);

const rq = createRequire(join(root, 'package.json'));

/** Nest microservices optional transports — keep as runtime require() (never hit for TCP-only). */
const lazyOptional = new Set([
  'amqplib',
  'amqp-connection-manager',
  'kafkajs',
  'mqtt',
  'ioredis',
  'nats',
  '@grpc/grpc-js',
  '@grpc/proto-loader',
  '@nestjs/websockets/socket-module',
]);

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(dist, 'main.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: join(dist, 'run.cjs'),
  sourcemap: false,
  logLevel: 'info',
  ...(bundleMarkdownAsText ? { loader: { '.md': 'text' } } : {}),
  plugins: [
    {
      name: 'nestjs-optional-external',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.path === '@nestjs/platform-express') {
            return { path: rq.resolve('@nestjs/platform-express') };
          }
          if (lazyOptional.has(args.path)) {
            return { path: args.path, external: true };
          }
          return null;
        });
      },
    },
  ],
});
