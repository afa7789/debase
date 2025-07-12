/**
 * Main function to fetch OHLC data from Kraken's public API.
 * @param {string} pair - The currency pair to fetch (e.g., 'XBTUSD').
 * @param {string} lastDate - The last recorded date in 'YYYY-MM-DD' format.
 * @returns {Promise<Array<Array<string|number>>>} - A promise that resolves to an array of new rows.
 */
async function fetchKrakenData(pair, lastDate) {
    // 1. Calculate the 'since' timestamp from the last recorded date.
    // Add one day to avoid fetching the same data again.
    const sinceDate = new Date(lastDate);
    sinceDate.setDate(sinceDate.getDate() + 1);
    const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);

    // 2. Build the Kraken API URL.
    // The interval '1440' corresponds to 1 day (24 hours * 60 minutes).
    const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1440&since=${sinceTimestamp}`;

    console.log(`🔍 Fetching data for ${pair} since ${sinceDate.toISOString().split('T')[0]}...`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Network error: ${response.statusText}`);
        }

        const data = await response.json();

        // 3. Check if the API returned an error.
        if (data.error && data.error.length > 0) {
            throw new Error(`Kraken API error: ${data.error.join(', ')}`);
        }

        // 4. Process the response and format it for csvManager.
        const resultPair = Object.keys(data.result)[0];
        const ohlcData = data.result[resultPair];

        if (!ohlcData) {
            console.log(`✅ No new information found for ${pair}.`);
            return [];
        }

        const newRows = ohlcData.map(row => {
            const [timestamp, open, high, low, close, vwap, volume, count] = row;
            // Convert the timestamp (seconds) to 'YYYY-MM-DD' date format.
            const date = new Date(timestamp * 1000).toISOString().split('T')[0];
            
            // Return in the format [date, open, high, low, close, volume]
            // Adjust the fields according to your CSV headers.
            return [date, parseFloat(open), parseFloat(high), parseFloat(low), parseFloat(close), parseFloat(volume)];
        });

        console.log(`📥 Received ${newRows.length} new rows for ${pair}.`);
        return newRows;

    } catch (error) {
        console.error(`✗ Error fetching data for ${pair}:`, error);
        return []; // Return an empty array in case of error.
    }
}

// 1. For Gold (using Tether Gold - XAUT)
// Ticker on Kraken: XAUTUSD
const fetchGoldData = (lastDate) => fetchKrakenData('XAUTUSD', lastDate);

// 2. For Bitcoin (BTC)
// Ticker on Kraken: XBTUSD (Kraken uses XBT instead of BTC)
const fetchBtcData = (lastDate) => fetchKrakenData('XBTUSD', lastDate);

// 3. For Ethereum (ETH)
// Ticker on Kraken: ETHUSD
const fetchEthData = (lastDate) => fetchKrakenData('ETHUSD', lastDate);

// 4. For Monero (XMR)
// Ticker on Kraken: XMRUSD
const fetchXmrData = (lastDate) => fetchKrakenData('XMRUSD', lastDate);
