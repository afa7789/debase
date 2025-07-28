import pandas as pd
import datetime

# Constants
initial_eth = 10  # Starting amount of 10 ETH
srs_apy = 0.045   # 4.5% APY for SRS
eth_stake_apy = 0.027 # 2.7% APY for ETH Stake

# Daily multipliers (calculated once)
srs_daily_multiplier = (1 + srs_apy) ** (1 / 365)
eth_stake_daily_multiplier = (1 + eth_stake_apy) ** (1 / 365)

# --- Function to get ETH price for a specific date ---
def get_eth_price(eth_data, date_str):
    try:
        price = eth_data[eth_data['Start'] == date_str]['Close'].iloc[0]
        return price
    except (IndexError, KeyError):
        print(f"Warning: No price data for {date_str}")
        return None

# --- Function to perform analysis for a given period ---
def analyze_period(start_date_str, total_days, monthly_days_list, period_name):
    print(f"\n--- {period_name} Analysis ({start_date_str} onwards) ---")

    try:
        eth_data = pd.read_csv('datasets/ethereum_2015-08-07_2025-07-25.csv')
        eth_data['Start'] = pd.to_datetime(eth_data['Start']).dt.strftime('%Y-%m-%d')
        
        # Get initial ETH price
        eth_price_start = get_eth_price(eth_data, start_date_str)
        if eth_price_start is None:
            return
            
    except FileNotFoundError:
        print("Error: CSV file 'ethereum_2015-08-07_2025-07-25.csv' not found. Please ensure it's in the 'datasets/' folder.")
        return

    initial_usd = initial_eth * eth_price_start

    print(f"\nETH Price on {start_date_str}: ${eth_price_start:,.2f} USD")
    print(f"Starting amount: {initial_eth} ETH (${initial_usd:,.2f} USD)")

    # Monthly breakdown
    monthly_srs_eth = []
    monthly_srs_usd = []
    monthly_eth_stake_eth = []
    monthly_eth_stake_usd = []
    months_labels = []

    current_srs_eth = initial_eth
    current_eth_stake_eth = initial_eth
    
    # Generate month labels and calculate for each month
    start_year, start_month, start_day = map(int, start_date_str.split('-'))
    current_date = datetime.date(start_year, start_month, start_day)
    days_passed = 0

    for i, days_in_month in enumerate(monthly_days_list):
        # Calculate end date for this month
        end_date = current_date + datetime.timedelta(days=days_in_month)
        end_date_str = end_date.strftime('%Y-%m-%d')
        
        # Get ETH price at end of month
        eth_price_end = get_eth_price(eth_data, end_date_str)
        if eth_price_end is None:
            # Try to find closest date
            for j in range(1, 8):  # Try up to 7 days before/after
                test_date = end_date - datetime.timedelta(days=j)
                eth_price_end = get_eth_price(eth_data, test_date.strftime('%Y-%m-%d'))
                if eth_price_end is not None:
                    break
            if eth_price_end is None:
                for j in range(1, 8):
                    test_date = end_date + datetime.timedelta(days=j)
                    eth_price_end = get_eth_price(eth_data, test_date.strftime('%Y-%m-%d'))
                    if eth_price_end is not None:
                        break
        
        if eth_price_end is None:
            print(f"Error: Could not find ETH price for month ending around {end_date_str}")
            continue
        
        # Calculate SRS growth (fixed APY, no price exposure)
        current_srs_eth *= (srs_daily_multiplier ** days_in_month)
        
        # Calculate ETH Stake growth (staking yield + price appreciation)
        # ETH amount grows by staking yield
        current_eth_stake_eth *= (eth_stake_daily_multiplier ** days_in_month)
        
        # Create month label
        month_label = f"End of {end_date.strftime('%b %Y')}"
        months_labels.append(month_label)
        
        # Store results
        monthly_srs_eth.append(current_srs_eth)
        monthly_srs_usd.append(current_srs_eth * eth_price_end)  # SRS now uses current ETH price
        monthly_eth_stake_eth.append(current_eth_stake_eth)
        monthly_eth_stake_usd.append(current_eth_stake_eth * eth_price_end)  # ETH stake uses current ETH price
        
        # Move to next period
        current_date = end_date
        days_passed += days_in_month
    
    # Print monthly breakdown
    if True:
        print(f"\n--- Monthly Breakdown ---")
        print("\nSRS (4.5% APY):")
        for i, label in enumerate(months_labels):
            print(f"  {label}: {monthly_srs_eth[i]:.3f} ETH (${monthly_srs_usd[i]:,.2f} USD)")

        print("\nETH Stake (2.7% APY):")
        for i, label in enumerate(months_labels):
            print(f"  {label}: {monthly_eth_stake_eth[i]:.3f} ETH (${monthly_eth_stake_usd[i]:,.2f} USD)")

    # Final summary - get final ETH price
    final_date = datetime.date(start_year, start_month, start_day) + datetime.timedelta(days=total_days)
    final_date_str = final_date.strftime('%Y-%m-%d')
    eth_price_final = get_eth_price(eth_data, final_date_str)
    
    if eth_price_final is None:
        # Try to find closest date
        for j in range(1, 8):
            test_date = final_date - datetime.timedelta(days=j)
            eth_price_final = get_eth_price(eth_data, test_date.strftime('%Y-%m-%d'))
            if eth_price_final is not None:
                break
    
    if eth_price_final is None:
        print("Warning: Using start price for final calculations")
        eth_price_final = eth_price_start

    # Calculate final amounts
    srs_final_eth = initial_eth * (srs_daily_multiplier ** total_days)
    srs_yield_eth = srs_final_eth - initial_eth
    srs_final_usd = srs_final_eth * eth_price_final  # SRS now uses final ETH price
    srs_yield_usd = srs_final_usd - initial_usd

    eth_stake_final_eth = initial_eth * (eth_stake_daily_multiplier ** total_days)
    eth_stake_yield_eth = eth_stake_final_eth - initial_eth
    eth_stake_final_usd = eth_stake_final_eth * eth_price_final  # ETH stake uses final ETH price
    eth_stake_yield_usd = eth_stake_final_usd - initial_usd

    print(f"\n--- Final Summary ({period_name}) ---")
    print(f"\nFinal ETH Price: ${eth_price_final:,.2f} USD (vs ${eth_price_start:,.2f} start)")
    print(f"ETH Price Change: {((eth_price_final/eth_price_start - 1) * 100):+.1f}%")
    
    print("\nSRS (4.5% APY):")
    print(f"  Final amount: {srs_final_eth:.3f} ETH (${srs_final_usd:,.2f} USD)")
    print(f"  Yield: {srs_yield_eth:.3f} ETH (${srs_yield_usd:,.2f} USD)")

    print("\nETH Stake (2.7% APY + ETH Price Change):")
    print(f"  Final amount: {eth_stake_final_eth:.3f} ETH (${eth_stake_final_usd:,.2f} USD)")
    print(f"  Yield: {eth_stake_yield_eth:.3f} ETH (${eth_stake_yield_usd:,.2f} USD)")


# --- Run Analyses ---

# 3-Month Analysis (January 2025 - March 2025)
analyze_period(
    start_date_str='2025-01-01',
    total_days=90, # Jan (31) + Feb (28) + Mar (31) = 90
    monthly_days_list=[31, 28, 31], # Days for Jan, Feb (2025 is not leap year), Mar
    period_name="3-Month Period (Jan-Mar 2025)"
)

# 1-Year Analysis (June 2024 - May 2025)
analyze_period(
    start_date_str='2024-06-01',
    total_days=365,
    monthly_days_list=[30, 31, 31, 30, 31, 30, 31, 31, 28, 31, 30, 31], # Jun 24 to May 25
    period_name="1-Year Period (Jun 2024 - May 2025)"
)

# 2-Year Analysis (June 2023 - May 2025)
analyze_period(
    start_date_str='2023-06-01',
    total_days=730,
    monthly_days_list=[30, 31, 31, 30, 31, 30, 31, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31, 30, 31], # Jun 23 to May 25 (24 months)
    period_name="2-Year Period (Jun 2023 - May 2025)"
)