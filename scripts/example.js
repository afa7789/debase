
import csvManager from './csv-manager.js'; // Assuming csv-manager.js is in the same directory

// --- Original functions adapted to use csvManager ---

/**
 * Loads a CSV file into csvManager as a new dataset.
 * @param {string} datasetName - The name to assign to the dataset in csvManager.
 * @param {string} csvContent - The raw CSV content as a string.
 * @param {string[]} headers - An array of headers from the CSV, including 'timestamp'.
 */
async function loadCsvContentToCsvManager(datasetName, csvContent, headers) {
    // csvManager expects a path for initDataset, but we have content.
    // We need to simulate the structure csvManager expects or adapt its internal methods.
    // For this example, let's assume csvManager has a way to directly ingest data
    // or we pre-process the content into the format csvManager expects for addDataPoint.

    // If csvManager.initDataset only takes a path, we might need to write the content to a temp file first.
    // For demonstration, let's assume we can directly add data points after parsing.

    // Parse the CSV content manually to extract rows, then add to csvManager.
    const lines = csvContent.trim().split('\n');
    const csvHeaders = lines[0].split(';'); // Assuming semicolon delimiter

    // Initialize the dataset in csvManager with the expected headers
    // This is a conceptual step, as csvManager's initDataset typically reads from a file.
    // We'll use addDataPoint for each row.
    csvManager.addDataset(datasetName, csvHeaders);

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';');
        if (values.length !== csvHeaders.length) continue;

        const timestamp = values[0];
        const rowData = {};
        for (let j = 1; j < csvHeaders.length; j++) {
            rowData[csvHeaders[j]] = isNaN(values[j]) ? values[j] : parseFloat(values[j]);
        }
        // Add the data point to the dataset in csvManager
        csvManager.addDataPoint(datasetName, timestamp, rowData);
    }
    console.log(`Dataset '${datasetName}' loaded into csvManager.`);
}

/**
 * Inserts new data into a specified dataset within csvManager.
 * @param {string} datasetName - The name of the dataset to insert data into.
 * @param {Array<string | number>} arrayOfInformation - An array with [timestamp, value1, value2, ...].
 * @param {string[]} headers - The headers for the dataset, including 'timestamp'.
 */
function insertNewToCsvManager(datasetName, arrayOfInformation, headers) {
    const timestamp = arrayOfInformation[0];
    const rowData = {};
    for (let i = 1; i < headers.length; i++) {
        const value = isNaN(arrayOfInformation[i]) ? arrayOfInformation[i] : parseFloat(arrayOfInformation[i]);
        rowData[headers[i]] = value;
    }
    csvManager.addDataPoint(datasetName, timestamp, rowData);
    console.log(`New data for ${timestamp} inserted into dataset '${datasetName}'.`);
}

// --- Example Usage with csvManager ---

async function main() {
    // Simulate reading CSV content (in a real scenario, this would come from fs.readFileSync or fetch)
    const simulatedCsvContent = `timestamp;CPI;daily_multiplicator
2008-01-08;210.8;1.00007
2008-01-09;211.2032;1.000081
2008-01-10;211.5;1.000075`;

    const datasetName = 'CPI_U_Simulated';
    const headers = ['timestamp', 'CPI', 'daily_multiplicator'];

    // 1. Load initial CSV content into csvManager
    await loadCsvContentToCsvManager(datasetName, simulatedCsvContent, headers);

    // 2. Insert new data
    const newData = ['2008-01-11', 211.8, 1.00008]; // New data for 2008-01-11
    insertNewToCsvManager(datasetName, newData, headers);

    // 3. Verify data and iterate using csvManager's capabilities
    console.log('\n--- Verifying and Iterating Data ---');

    // Get dataset info
    const info = csvManager.getDatasetInfo(datasetName);
    console.log(`Dataset '${datasetName}' Info:`, info);

    // Get a specific data point
    console.log(`Data for 2008-01-09:`, csvManager.getDataPoint(datasetName, '2008-01-09'));

    // Iterate through data using csvManager's date range iteration
    const startDate = '2008-01-08';
    const endDate = '2008-01-11';

    console.log(`\nIterating from ${startDate} to ${endDate}:`);
    const datesInRange = csvManager.getDatesInRange(datasetName, startDate, endDate);
    for (const date of datesInRange) {
        const data = csvManager.getDataPoint(datasetName, date);
        console.log(`Date: ${date}, Values:`, data);
    }

    // Example of getting all dates (if needed)
    console.log('\nAll dates in dataset:', csvManager.getDates(datasetName));
}

main();