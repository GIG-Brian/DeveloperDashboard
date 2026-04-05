const path = require('path');
module.exports = {
  entry: './src/dashboard.ts',
  output: {
    filename: 'dashboard.js',
    path: path.resolve(__dirname, 'dist')
  },
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }]
  },
  mode: 'production'
};
