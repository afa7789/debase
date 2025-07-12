// Multi-Dataset CSV Manager - Functional Approach
// Note: This uses localStorage which works in real browsers but not in Claude artifacts

// Global state - Map of datasets
const datasets = new Map();

// Dataset structure factory
const createDataset = (name) => ({
    name,
    dataMap: new Map(),
    dateList: [],
    headers: [],
    lastUpdated: null,
    fetchNewData: () => {return [];}
});

// Utility functions
const isToday = (date) => {
    const today = new Date();
    const compareDate = new Date(date);
    return today.toDateString() === compareDate.toDateString();
};

const isDataCurrent = (lastUpdatedDate) => {
    if (!lastUpdatedDate) return false;
    const today = new Date();
    const dataDate = new Date(lastUpdatedDate);
    return dataDate.toDateString() === today.toDateString();
};

const shouldLookForNewInfo = (datasetName) => {
    const dataset = datasets.get(datasetName);
    return dataset ? !isDataCurrent(dataset.lastUpdated) : true;
};

// Storage operations using IndexedDB (see s<script src="https://cdn.jsdelivr.net/npm/idb@7/build/umd.js"></script>)
const saveToStorage = async (datasetName) => {
    const dataset = datasets.get(datasetName);
    if (!dataset) {
        console.error(`✗ Dataset ${datasetName} not found`);
        return;
    }
    try {
        const storageKey = `csv_data_${datasetName}`;
        const dataToStore = {
            name: dataset.name,
            dataMap: Array.from(dataset.dataMap.entries()),
            dateList: [...dataset.dateList],
            headers: [...dataset.headers],
            lastUpdated: dataset.lastUpdated
        };
        await window.idbSet(storageKey, dataToStore);
        console.log(`✓ Dataset ${datasetName} saved to IndexedDB`);
    } catch (error) {
        console.error(`✗ Error saving dataset ${datasetName} to IndexedDB:`, error);
    }
};

const loadFromStorage = async (datasetName) => {
    try {
        const storageKey = `csv_data_${datasetName}`;
        const parsed = await window.idbGet(storageKey);
        if (!parsed) return null;
        console.log(`✓ Dataset ${datasetName} loaded from IndexedDB`);
        return parsed;
    } catch (error) {
        console.error(`✗ Error loading dataset ${datasetName} from IndexedDB:`, error);
        return null;
    }
};

// CSV operations
const loadFromCSV = async (datasetName, csvPath, fetchFunction) => {
    try {
        const response = await fetch(csvPath);
        const csvData = await response.text();

        const dataset = createDataset(datasetName);
        const lines = csvData.trim().split('\n');

        // Try to detect separator: if only one header, try splitting by ','
        let headers = lines[0].split(';');
        let separator = ';';
        if (headers.length === 1) {
            headers = lines[0].split(',');
            separator = ',';
        }
        dataset.headers = headers;

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(separator);
            if (values.length !== dataset.headers.length) continue;

            const timestamp = values[0];
            const rowData = {};

            for (let j = 1; j < dataset.headers.length; j++) {
                const value = values[j];
                rowData[dataset.headers[j]] = isNaN(value) ? value : parseFloat(value);
            }

            dataset.dataMap.set(timestamp, rowData);
            dataset.dateList.push(timestamp);
        }

        // Ensure dateList is sorted
        dataset.dateList.sort();
        dataset.lastUpdated = new Date().toISOString();

        // If a fetch function is provided, set it
        if (fetchFunction) {
            dataset.fetchNewData = fetchFunction;
        }

        // Store in global datasets map
        datasets.set(datasetName, dataset);

        console.log(`✓ Dataset ${datasetName} loaded ${dataset.dateList.length} records from CSV`);

    } catch (error) {
        console.error(`✗ Error loading CSV for ${datasetName}:`, error);
        throw error;
    }
};

/**
 * Inserts or updates a row in the specified dataset.
 * If the timestamp already exists, it updates the existing record (upsert).
 * If the timestamp is new, it inserts it while maintaining chronological order.
 *
 * @param {string} datasetName - The name of the dataset to modify.
 * @param {Array<string|number>} arrayOfInformation - An array where the first element is the timestamp (YYYY-MM-DD)
 * and subsequent elements are the data values in the order of the dataset headers.
 */
const insertNew = (datasetName, arrayOfInformation) => {
    const dataset = datasets.get(datasetName);
    if (!dataset) {
        console.error(`✗ Dataset '${datasetName}' not found.`);
        return;
    }

    const timestamp = arrayOfInformation[0];
    
    // Create the row data object from the input array
    const rowData = {};
    // Start from index 1, as index 0 is the timestamp
    for (let i = 1; i < dataset.headers.length; i++) {
        const header = dataset.headers[i];
        const value = arrayOfInformation[i];
        // Ensure numeric values are stored as numbers
        rowData[header] = isNaN(value) ? value : parseFloat(value);
    }

    // Check if the timestamp already exists for an UPSERT operation
    if (dataset.dataMap.has(timestamp)) {
        // --- UPDATE (Upsert) ---
        // Merge new data into the existing record
        const existingRecord = dataset.dataMap.get(timestamp);
        Object.assign(existingRecord, rowData);
        console.log(`✓ Updated data for '${datasetName}' at ${timestamp}`);
    } else {
        // --- INSERT (Upsert) ---
        // Add new record to the map
        dataset.dataMap.set(timestamp, rowData);
        
        // Insert the new timestamp into the dateList while maintaining order
        // This is more efficient than sorting the whole array every time.
        if (dataset.dateList.length === 0 || timestamp > dataset.dateList[dataset.dateList.length - 1]) {
            dataset.dateList.push(timestamp);
        } else {
            // Find the correct insertion point if the date is not at the end
            let left = 0;
            let right = dataset.dateList.length;
            while (left < right) {
                const mid = Math.floor((left + right) / 2);
                if (dataset.dateList[mid] < timestamp) {
                    left = mid + 1;
                } else {
                    right = mid;
                }
            }
            dataset.dateList.splice(left, 0, timestamp);
        }
        console.log(`✓ Inserted new data for '${datasetName}' at ${timestamp}`);
    }
};

const getNextDate = (datasetName, currentDate) => {
    const dataset = datasets.get(datasetName);
    if (!dataset) return null;
    
    const currentIndex = dataset.dateList.indexOf(currentDate);
    if (currentIndex === -1 || currentIndex === dataset.dateList.length - 1) return null;
    return dataset.dateList[currentIndex + 1];
};

const getPreviousDate = (datasetName, currentDate) => {
    const dataset = datasets.get(datasetName);
    if (!dataset) return null;
    
    const currentIndex = dataset.dateList.indexOf(currentDate);
    if (currentIndex === -1 || currentIndex === 0) return null;
    return dataset.dateList[currentIndex - 1];
};

// Data retrieval
const getData = (datasetName, timestamp) => {
    const dataset = datasets.get(datasetName);
    return dataset ? dataset.dataMap.get(timestamp) : null;
};

const getDataRange = (datasetName, startDate, endDate) => {
    const dataset = datasets.get(datasetName);
    if (!dataset) return [];
    
    const result = [];
    const startIndex = dataset.dateList.indexOf(startDate);
    const endIndex = dataset.dateList.indexOf(endDate);
    
    if (startIndex === -1 || endIndex === -1) return result;
    
    for (let i = startIndex; i <= endIndex; i++) {
        const date = dataset.dateList[i];
        result.push({
            timestamp: date,
            ...dataset.dataMap.get(date)
        });
    }
    
    return result;
};

const iterateRange = (datasetName, startDate, endDate, callback) => {
    const dataset = datasets.get(datasetName);
    if (!dataset) return;
    
    let currentDate = startDate;
    
    while (currentDate && currentDate <= endDate) {
        const data = dataset.dataMap.get(currentDate);
        callback(currentDate, data);
        currentDate = getNextDate(datasetName, currentDate);
    }
};

// New implementation, now useful!
const lookForNewInformation = async (datasetName) => {
    const dataset = datasets.get(datasetName);
    if (!dataset || !dataset.fetchNewData) {
        console.log(`ℹ️ No update strategy defined for ${datasetName}.`);
        return;
    }

    console.log(`🔍 Looking for new information for ${datasetName}...`);
    try {
        const lastDate = getLastDate(datasetName); // Get the last date we have
        const newRows = await dataset.fetchNewData(lastDate); // Call the callback!

        if (!newRows || newRows.length === 0) {
            console.log(`✅ No new information found for ${datasetName}.`);
            return;
        }

        console.log(`📥 Received ${newRows.length} new rows for ${datasetName}.`);

        // Insert each new row into the dataset
        newRows.forEach(row => {
            // Optional validation: check if the row's date is more recent than the last date
            if (row[0] > lastDate) {
                insertNew(datasetName, row);
            }
        });

        // After adding, update the timestamp and save
        dataset.lastUpdated = new Date().toISOString();
        saveToStorage(datasetName);
        
        console.log(`💾 Dataset ${datasetName} updated and saved.`);

    } catch (error) {
        console.error(`✗ Error fetching new information for ${datasetName}:`, error);
    }
};

// Single dataset initialization
const initDataset = async (datasetName, csvPath, fetchFunction) => {
    console.log(`🚀 Initializing dataset ${datasetName}...`);
    // Try to load from storage first
    const stored = await loadFromStorage(datasetName);
    if (stored && isDataCurrent(stored.lastUpdated)) {
        console.log(`📦 Loading ${datasetName} from storage...`);
        const dataset = createDataset(datasetName);
        dataset.dataMap = new Map(stored.dataMap);
        dataset.dateList = stored.dateList;
        dataset.headers = stored.headers;
        dataset.lastUpdated = stored.lastUpdated;
        dataset.fetchNewData = fetchFunction || (() => { return []; });
        datasets.set(datasetName, dataset);
    } else {
        console.log(`🌐 Fetching fresh data for ${datasetName}...`);
        await loadFromCSV(datasetName, csvPath, fetchFunction);
        await saveToStorage(datasetName);
    }
    // Check if we need new information
    if (shouldLookForNewInfo(datasetName)) {
        console.log(`📅 Dataset ${datasetName} is outdated, checking for updates...`);
        lookForNewInformation(datasetName);
    }
    const dataset = datasets.get(datasetName);
    console.log(`✅ ${datasetName} initialized with ${dataset.dateList.length} records`);
};

// Batch initialization
const initAllDatasets = async (datasetConfigs) => {
    console.log(`🚀 Initializing ${datasetConfigs.length} datasets...`);
    for (const config of datasetConfigs) {
        await initDataset(config.name, config.csvPath, config.fetchFunction);
    }
    console.log(`✅ All datasets initialized`);
    console.log(`📊 Loaded datasets: ${Array.from(datasets.keys()).join(', ')}`);
};

// Helper functions for dataset info
const getFirstDate = (datasetName) => {
    const dataset = datasets.get(datasetName);
    return dataset ? dataset.dateList[0] : null;
};

const getLastDate = (datasetName) => {
    const dataset = datasets.get(datasetName);
    return dataset ? dataset.dateList[dataset.dateList.length - 1] : null;
};

const getTotalRecords = (datasetName) => {
    const dataset = datasets.get(datasetName);
    return dataset ? dataset.dateList.length : 0;
};

const getHeaders = (datasetName) => {
    const dataset = datasets.get(datasetName);
    return dataset ? [...dataset.headers] : [];
};

const getLastUpdated = (datasetName) => {
    const dataset = datasets.get(datasetName);
    return dataset ? dataset.lastUpdated : null;
};

const getDatasetNames = () => Array.from(datasets.keys());

const getDatasetInfo = (datasetName) => {
    const dataset = datasets.get(datasetName);
    if (!dataset) return null;
    
    return {
        name: dataset.name,
        totalRecords: dataset.dateList.length,
        firstDate: dataset.dateList[0],
        lastDate: dataset.dateList[dataset.dateList.length - 1],
        headers: [...dataset.headers],
        lastUpdated: dataset.lastUpdated
    };
};

const getAllDatasetsInfo = () => {
    const info = {};
    datasets.forEach((dataset, name) => {
        info[name] = getDatasetInfo(name);
    });
    return info;
};

// Export object for easy access
const csvManager = {
    // Initialization
    initDataset,
    initAllDatasets,
    
    // Data manipulation
    insertNew,
    
    // Data retrieval
    getData,
    getDataRange,
    iterateRange,
    
    // Navigation
    getNextDate,
    getPreviousDate,
    
    // Dataset info
    getFirstDate,
    getLastDate,
    getTotalRecords,
    getHeaders,
    getLastUpdated,
    getDatasetNames,
    getDatasetInfo,
    getAllDatasetsInfo,
    
    // Updates
    lookForNewInformation,
    
    // Storage
    saveToStorage,
    loadFromStorage
};

// Add this line at the very end of the file
// export default csvManager;

// Example usage:
/*
// Initialize multiple datasets
const datasetConfigs = [
    { name: 'CPI_U', csvPath: 'data/CPI_U.csv' },
    { name: 'unemployment', csvPath: 'data/unemployment.csv' },
    { name: 'gdp', csvPath: 'data/gdp.csv' },
    { name: 'inflation', csvPath: 'data/inflation.csv' },
    { name: 'interest_rates', csvPath: 'data/interest_rates.csv' }
];

await csvManager.initAllDatasets(datasetConfigs);

// Get specific data point from a dataset
const cpiData = csvManager.getData('CPI_U', '2008-01-09');
console.log('CPI Data:', cpiData);

// Add new data to specific dataset
csvManager.insertNew('CPI_U', ['2008-01-09', 211.2032, 1.000081]);

// Iterate through a range for specific dataset
csvManager.iterateRange('CPI_U', '2008-01-08', '2008-01-10', (date, data) => {
    console.log(`CPI Date: ${date}, Data:`, data);
});

// Get info about all datasets
console.log('All datasets info:', csvManager.getAllDatasetsInfo());

// Get list of available datasets
console.log('Available datasets:', csvManager.getDatasetNames());
*/