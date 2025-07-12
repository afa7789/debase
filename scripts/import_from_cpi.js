/**
 * Fetches, processes, and projects daily CPI data from the BLS API.
 * This function is designed to be the core logic for handling CPI datasets.
 * It fetches recent monthly data, interpolates it to a daily series, projects
 * future values up to the current date using linear regression, and calculates
 * the daily inflation multiplier.
 *
 * @param {string} lastDate - The last recorded date in 'YYYY-MM-DD' format. This is used
 *   to determine if new data needs to be fetched and processed.
 * @param {string} seriesId - The BLS series ID for the desired CPI data (e.g., "CUUR0000SA0").
 * @returns {Promise<Array<Array<string|number>>>} A promise that resolves to an array of new rows,
 *   formatted as [timestamp, CPI, daily_multiplicator].
 */
async function fetchAndProcessCpiData(lastDate, seriesId = "CUUR0000SA0") {
    const today = new Date().toISOString().split('T')[0];

    // Optimization: If the last known date is today, no need to fetch/process.
    if (lastDate === today) {
        console.log(`✅ CPI data is already up-to-date for ${today}.`);
        return [];
    }

    const url = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
    const currentYear = new Date( ).getFullYear();
    // Fetch data from the last two years to ensure a stable base for interpolation and regression.
    const startYear = currentYear - 2;

    console.log(`🔍 Fetching monthly CPI data for series ${seriesId} from ${startYear} to ${currentYear}...`);

    try {
        // 1. FETCH RECENT MONTHLY DATA FROM BLS API
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "seriesid": [seriesId],
                "startyear": String(startYear),
                "endyear": String(currentYear)
            })
        });

        if (!response.ok) throw new Error(`Network error: ${response.statusText}`);
        const apiResult = await response.json();
        if (apiResult.status !== 'REQUEST_SUCCEEDED') {
            throw new Error(`BLS API error: ${apiResult.message.join("\n")}`);
        }

        const monthlyData = apiResult.Results.series[0].data
            .map(d => ({
                year: parseInt(d.year),
                month: parseInt(d.period.substring(1)),
                value: parseFloat(d.value)
            }))
            .sort((a, b) => a.year - b.year || a.month - b.month);

        console.log(`📥 Received ${monthlyData.length} monthly data points.`);

        // 2. INTERPOLATE TO GET DAILY DATA
        const dailyData = [];
        for (let i = 0; i < monthlyData.length - 1; i++) {
            const startPoint = monthlyData[i];
            const endPoint = monthlyData[i + 1];
            const startDate = new Date(Date.UTC(startPoint.year, startPoint.month - 1, 1));
            const endDate = new Date(Date.UTC(endPoint.year, endPoint.month - 1, 1));
            
            const daysDiff = (endDate - startDate) / (1000 * 3600 * 24);
            const dailyIncrement = (endPoint.value - startPoint.value) / daysDiff;

            for (let j = 0; j < daysDiff; j++) {
                const currentDate = new Date(startDate);
                currentDate.setUTCDate(startDate.getUTCDate() + j);
                dailyData.push({
                    timestamp: currentDate.toISOString().split('T')[0],
                    CPI: startPoint.value + j * dailyIncrement
                });
            }
        }
        
        console.log(`📈 Interpolated to ${dailyData.length} daily data points.`);

        // 3. LINEAR REGRESSION FOR PROJECTION
        const lastProcessedDate = new Date(dailyData[dailyData.length - 1].timestamp);
        const todayDate = new Date();
        todayDate.setUTCHours(0, 0, 0, 0);

        if (lastProcessedDate < todayDate) {
            console.log("🔮 Projecting future CPI values using linear regression...");
            const regressionPoints = dailyData.slice(-365).map((d, index) => ({ x: index, y: d.CPI }));
            const n = regressionPoints.length;
            const sumX = regressionPoints.reduce((acc, p) => acc + p.x, 0);
            const sumY = regressionPoints.reduce((acc, p) => acc + p.y, 0);
            const sumXY = regressionPoints.reduce((acc, p) => acc + p.x * p.y, 0);
            const sumXX = regressionPoints.reduce((acc, p) => acc + p.x * p.x, 0);

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;

            let currentDate = new Date(lastProcessedDate);
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            let regressionIndex = n;

            while (currentDate <= todayDate) {
                dailyData.push({
                    timestamp: currentDate.toISOString().split('T')[0],
                    CPI: slope * regressionIndex + intercept
                });
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                regressionIndex++;
            }
            console.log(`✨ Projection complete up to ${todayDate.toISOString().split('T')[0]}.`);
        }

        // 4. CALCULATE DAILY MULTIPLIER AND FORMAT FOR UPSERT
        const newRows = [];
        // Filter for only the new dates that need to be inserted/updated
        const startIndex = dailyData.findIndex(d => d.timestamp > lastDate);
        
        if (startIndex === -1) {
            console.log('✅ No new daily entries to add.');
            return [];
        }

        // We need the day before the new data to calculate the first multiplier
        const previousDayIndex = startIndex > 0 ? startIndex - 1 : 0;

        for (let i = previousDayIndex; i < dailyData.length; i++) {
            let daily_multiplicator;
            if (i === 0 || dailyData[i-1].CPI === 0) {
                daily_multiplicator = 1.0;
            } else {
                const cpi_n = dailyData[i].CPI;
                const cpi_n_1 = dailyData[i - 1].CPI;
                daily_multiplicator = 1 + (cpi_n - cpi_n_1) / cpi_n_1;
            }
            
            // Only add the new rows to the final output array
            if (i >= startIndex) {
                newRows.push([
                    dailyData[i].timestamp,
                    parseFloat(dailyData[i].CPI.toFixed(4)),
                    parseFloat(daily_multiplicator.toFixed(6))
                ]);
            }
        }
        
        console.log(`📦 Prepared ${newRows.length} new daily rows for CPI_U.`);
        return newRows;

    } catch (error) {
        console.error(`✗ Error processing CPI data:`, error);
        return []; // Return an empty array on error, as per the pattern.
    }
};

// Wrapper function for the specific CPI-U series, matching the desired pattern.
const fetchCpiUData = (lastDate) => fetchAndProcessCpiData(lastDate, 'CUUR0000SA0');
