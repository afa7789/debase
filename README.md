# DEBASE Project

A simple web app to visualize the long-term performance of Bitcoin, Ethereum, Monero, and Gold, adjusted for inflation and compared to the US dollar's purchasing power. The app uses D3.js for interactive charts and loads historical data from CSV files.

## What is this?
- Visualizes how crypto and gold prices changed over time
- Shows inflation-adjusted prices and the decline of the dollar's purchasing power
- Lets you compare assets in USD, gold, and relative terms

## scripts/

- **chart_draw.js**: All D3.js chart drawing functions (line charts, legends, axes, etc.)
- **dataset_manager.js**: Loads and manages CSV datasets, provides data to the app
- **import_from_kraken.js**: Imports and parses crypto price data from Kraken CSVs
- **import_from_cpi.js**: Imports and parses CPI/inflation data from CSV
- **example.js**: Example script for testing or demo purposes
- **iterator_example.js**: Example of iterating over datasets
- **dataset_manager.md / data_set_manager.md / package.md**: Documentation and notes for developers
- **package.json**: NPM dependencies for scripts (if any)

---

**How to use:**
Just open `index.html` in your browser. All charts and calculations run locally, no backend required. I suggest using a http-server or another serving method to check it correctly!