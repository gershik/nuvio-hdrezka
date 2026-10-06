#!/usr/bin/env node

/**
 * Build script for nuvio-hdrezka.
 *
 * Bundles src/hdrezka/index.js into providers/hdrezka.js, transpiling
 * async/await to generator functions for Hermes compatibility.
 *
 * Usage:
 *   node build.js           # build providers/hdrezka.js
 *   node build.js --minify  # also minify
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'providers');

// Modules the Nuvio runtime provides — don't bundle these.
const EXTERNAL = ['cheerio-without-node-native', 'cheerio', 'react-native-cheerio'];

async function buildProvider(name, options = {}) {
    const entry = path.join(srcDir, name, 'index.js');
    const out = path.join(outDir, `${name}.js`);

    if (!fs.existsSync(entry)) {
        console.error(`No src/${name}/index.js`);
        return false;
    }

    await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        outfile: out,
        format: 'cjs',
        platform: 'neutral',
        target: 'es2016',
        minify: options.minify || false,
        sourcemap: false,
        external: EXTERNAL,
        logLevel: 'warning',
    });

    const kb = (fs.statSync(out).size / 1024).toFixed(1);
    console.log(`✓ providers/${name}.js (${kb} KB)${options.minify ? ' (minified)' : ''}`);
    return true;
}

async function main() {
    const args = process.argv.slice(2);
    const minify = args.includes('--minify');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

    const ok = await buildProvider('hdrezka', { minify });
    process.exit(ok ? 0 : 1);
}

main();
