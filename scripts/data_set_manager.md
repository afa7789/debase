# Core Architecture:

Global State: datasets Map that stores all dataset objects
Dataset Structure: Each dataset has its own dataMap, dateList, headers, and lastUpdated
Dataset-Specific Operations: All functions now require a datasetName parameter

## Key Features:
### Multi-Dataset Initialization:
```javascript 
// Initialize individual dataset
await csvManager.initDataset('CPI_U', 'data/CPI_U.csv');
// Initialize all 5 datasets at once
const configs = [
    { name: 'CPI_U', csvPath: 'data/CPI_U.csv' },
    { name: 'unemployment', csvPath: 'data/unemployment.csv' },
    { name: 'gdp', csvPath: 'data/gdp.csv' },
    { name: 'inflation', csvPath: 'data/inflation.csv' },
    { name: 'interest_rates', csvPath: 'data/interest_rates.csv' }
];
await csvManager.initAllDatasets(configs);
Dataset-Specific Operations:
javascript// Get data from specific dataset
const cpiData = csvManager.getData('CPI_U', '2008-01-09');
const gdpData = csvManager.getData('gdp', '2008-01-09');

// Insert into specific dataset
csvManager.insertNew('CPI_U', ['2008-01-09', 211.2032, 1.000081]);

// Iterate specific dataset
csvManager.iterateRange('CPI_U', '2008-01-08', '2008-01-10', callback);
```

### Storage Management:

Each dataset gets its own localStorage key: csv_data_${datasetName}
Independent save/load operations per dataset
Separate freshness checks per dataset

### Dataset Information:
```javascript // Get info about specific dataset
csvManager.getDatasetInfo('CPI_U');

// Get all datasets info
csvManager.getAllDatasetsInfo();

// List available datasets
csvManager.getDatasetNames();
```
## Benefits:

Scalable: Easy to add more datasets
Efficient: Only loads/saves what's needed
Isolated: Each dataset operates independently
Flexible: Can work with individual datasets or all at once

The structure supports your 5 CSV files while maintaining clean separation and efficient operations per dataset.