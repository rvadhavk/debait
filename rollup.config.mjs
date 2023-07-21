import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { promises as fs } from 'fs';

const copyFiles = ['manifest.json', 'stylesheet.css'];
const configs = ['background.js', 'content.js', 'inject.js'].map(input => ({
  input,
  output: {
    dir: 'dist',
    format: 'iife',
  },
  plugins: [
    commonjs({
      esmExternals: true,
    }),
    resolve({
      browser: true,
    }),
  ]
}));


configs[0].plugins.push({
  name: 'copy-files',
  buildStart() {
    for (let f of copyFiles) {
      this.addWatchFile(f);
    }
  },
  buildEnd() {
    return Promise.all(copyFiles.map(f => fs.copyFile(f, `dist/${f}`)));
  }
}
                       );

export default configs;
