# AQUIRING DATA
For this project to work we need to get the data from somewhere.

## CPI
   
CPI prices was aquired here: https://data.bls.gov/series-report, with this series id: CUUR0000SA0.

CUUR0000SA0 is a specific series ID code used by the U.S. Bureau of Labor Statistics (BLS) to identify a particular dataset within their Consumer Price Index (CPI) program.

```js
async function getCpiDataV1(startYear, endYear) {
    const url = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
    const payload = {
        seriesid: ["CUUR0000SA0"],
        startyear: String(startYear),
        endyear: String(endYear)
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Erro HTTP! Status: ${response.status}`);
        }

        const data = await response.json();
        return data; // Contém os dados do CPI
    } catch (error) {
        console.error("Erro ao buscar dados da API BLS (v1):", error);
        return null;
    }
}
```

```python
import requests

def get_cpi_data_v1(start_year, end_year):
    url = 'https://api.bls.gov/publicAPI/v1/timeseries/data/'
    payload = {
        "seriesid": ["CUUR0000SA0"],
        "startyear": str(start_year),
        "endyear": str(end_year)
    }
    headers = {'Content-Type': 'application/json'}

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        return data
    except Exception as e:
        print("Error fetching BLS API data:", e)
        return None

start_year = 2025
end_year = 2025
data = get_cpi_data_v1(start_year, end_year)

if data:
    try:
        results = data['Results']['series'][0]['data']
        for item in results:
            print(f"Year: {item['year']}, Month: {item['periodName']}, Value: {item['value']}")
    except Exception as e:
        print("Error processing data:", e)
```

output example from code above:
```bash
Year: 2025, Month: May, Value: 321.465
Year: 2025, Month: April, Value: 320.795
Year: 2025, Month: March, Value: 319.799
Year: 2025, Month: February, Value: 319.082
Year: 2025, Month: January, Value: 317.671
```

### Generator

We will use a python script to generate a CPI_daily.csv

```bash
python3 generator_cpi_daily.py
```

## Gold
Onça troy	31,10 g

### stealing copying html element of the html table here:
https://finance.yahoo.com/quote/GC=F/history/?guccounter=1&guce_referrer=aHR0cHM6Ly9jaGF0Z3B0LmNvbS8&guce_referrer_sig=AQAAAIagZ0uRtkiCTxLaNp-YB46pu0YdoOnfMeLWAzLLgYrjJDU2d6_Z4ZgUqi9DTVoTAYvFJgrS1HCexwPePioZUPjM-8NpxghGpOEHUxPY7rHtW4J583Pqfb4AhtOaSONI06orTLeXDkgjHytJJiCWo2crs08sEZB3B64czW41GtBP&frequency=1mo&period1=978307200&period2=1748736000

### queryable method?
https://query1.finance.yahoo.com/v7/finance/download/GC=F?period1=978307200&period2=1748736000&interval=1d&events=history&includeAdjustedClose=true

## python3
```python
pip3 install --force-reinstall --no-cache-dir pandas yfinance --break-system-packages

import yfinance as yf

# Baixar desde 2001 até hoje
df = yf.download("GC=F", start="2001-01-01", end="2025-07-28", interval="1d")
df.to_csv("ouro.csv")
```
<!-- Silver Sep 25 (SI=F) -->

ainda não achei como pegar por API

### Update gold + silver automatically (recommended)

This repo includes a script that updates:
- `datasets/gold.csv` from Yahoo Finance ticker `GC=F`
- `datasets/silver.csv` from Yahoo Finance ticker `SI=F`

It reads the **last date you already have** (column `Price`) and appends missing daily rows up to **today (UTC)**.

From repo root:

```bash
python3 -m pip install --no-cache-dir pandas yfinance
python3 scripts/update_metals.py
```

Useful options:

```bash
python3 scripts/update_metals.py --dry-run
python3 scripts/update_metals.py --end 2026-01-15
```

##### Run with Docker (no local Python deps)

From repo root:

```bash
docker build -t debase-metals -f scripts/Dockerfile.metals scripts
docker run --rm -v "$PWD":/work debase-metals
```

> Note: Yahoo Finance doesn’t always publish a row for “today” (depends on market session / timing). The script will append whatever daily rows Yahoo returns.

### bitcoin
get like I do in satsukashi from `https://coincodex.com/crypto/bitcoin/historical-data/`
