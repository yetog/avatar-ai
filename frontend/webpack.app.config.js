import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    entry: './src/js/app.js',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname),
        clean: false
    },
    module: {
        rules: []
    },
    plugins: [],
    resolve: {
        extensions: ['.js']
    }
};
