import path from 'path';
import { fileURLToPath } from 'url';
import CopyPlugin from 'copy-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    entry: {
        elevenlabs: './src/js/elevenlabs-only.js',
        bundle: './src/js/app.js'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname),
        clean: false
    },
    module: {
        rules: []
    },
    plugins: [],
    resolve: {
        extensions: ['.js']
    },
    devServer: {
        static: {
            directory: __dirname
        },
        port: 3050,
        hot: true
    }
};
