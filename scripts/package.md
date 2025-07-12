A. Browser Usage
In a modern browser, you can import your module directly from an HTML file.
Place your csv-manager.js file on your web server.
In your HTML, use a <script type="module"> tag to import and use it.
index.html
html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>CSV Manager Example</title>
</head>
<body>
    <h1>CSV Manager Test</h1>
    <script type="module">
        // Import the manager from its path
        import csvManager from './csv-manager.js';

        // Example usage
        async function main() {
            const datasetConfigs = [
                // NOTE: The path must be accessible from the browser
                { name: 'CPI_U', csvPath: '/data/CPI_U.csv' }
            ];

            await csvManager.initAllDatasets(datasetConfigs);

            const info = csvManager.getDatasetInfo('CPI_U');
            console.log('CPI_U Info:', info);
        }

        main();
    </script>
</body>
</html>
Note: The localStorage and fetch APIs are browser-specific. Your code will work perfectly in the browser but will fail in a standard Node.js environment without additional packages to polyfill these APIs.
B. NPM / Node.js Usage
To use your code as an npm package, you would typically publish it to the npm registry. Once published, anyone (including you) can install and use it in a Node.js project.
Publish to NPM (Optional):
Run npm login in your terminal.
Run npm publish from your project's root directory.
Use in another project:
Install the package: npm install multi-dataset-csv-manager
Import and use it in your Node.js code:
app.js (in another project)
javascript
import csvManager from 'multi-dataset-csv-manager';
// Note: To make this work in Node.js, you would need to provide
// polyfills for `fetch` and `localStorage`.
// For example, using 'node-fetch' and 'node-localstorage'.

console.log('CSV Manager loaded:', csvManager.getDatasetNames());
By following these steps, you have successfully created a versatile JavaScript package that is ready for distribution and use in both browser and server-side applications.
Start agent
