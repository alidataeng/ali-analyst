console.log("Background script started.");

// --- Alarm Setup ---
// Create an alarm when the extension is installed or updated.
// Also, create it on browser startup.
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated. Setting up alarm.");
  chrome.alarms.create('watchlistAlarm', {
    delayInMinutes: 1, // Start after 1 minute
    periodInMinutes: 1 // Repeat every 1 minute (for testing, adjust to 5-15 for production)
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Browser started. Ensuring alarm is set.");
  // Check if alarm exists and create if not, or just recreate
  chrome.alarms.get('watchlistAlarm', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('watchlistAlarm', {
        delayInMinutes: 1,
        periodInMinutes: 1 
      });
      console.log("Alarm created on startup.");
    } else {
        console.log("Alarm already exists:", alarm);
    }
  });
});


// --- Alarm Listener ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'watchlistAlarm') {
    console.log("Watchlist alarm triggered!", new Date().toLocaleTimeString());

    const { watchlist } = await chrome.storage.local.get('watchlist');
    if (!watchlist || watchlist.length === 0) {
      console.log("Watchlist is empty. Nothing to check.");
      return;
    }

    let { watchlistTokenData } = await chrome.storage.local.get('watchlistTokenData');
    if (!watchlistTokenData) {
      watchlistTokenData = {}; // Initialize if not found
    }

    console.log("Current watchlist:", watchlist);
    console.log("Current watchlistTokenData:", watchlistTokenData);

    for (const tokenAddress of watchlist) {
      await fetchTokenPriceAndCheck(tokenAddress, watchlistTokenData);
    }
    // The updated watchlistTokenData is saved within fetchTokenPriceAndCheck
  }
});

// --- Fetch Token Price and Check ---
async function fetchTokenPriceAndCheck(tokenAddress, currentWatchlistTokenData) {
  const apiUrl = `https://public-api.birdeye.so/public/defi/v2/token_overview?address=${tokenAddress}`;
  let updatedWatchlistTokenData = { ...currentWatchlistTokenData }; // Work with a copy

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      // Handle HTTP errors (like 404, 500, etc.)
      if (response.status === 404) {
        console.warn(`Token not found on Birdeye (404): ${tokenAddress}. Removing from watchlistTokenData if present.`);
        // Optionally, remove from watchlistTokenData or mark as errored
        if (updatedWatchlistTokenData[tokenAddress]) {
            delete updatedWatchlistTokenData[tokenAddress]; // Remove price data for this token
            await chrome.storage.local.set({ watchlistTokenData: updatedWatchlistTokenData });
        }
      } else {
        console.error(`HTTP error fetching ${tokenAddress}: ${response.status} ${response.statusText}`);
      }
      return; // Don't proceed further for this token
    }

    const apiData = await response.json();

    if (apiData && apiData.success && apiData.data && apiData.data.price !== undefined) {
      const currentPrice = apiData.data.price;
      const tokenName = apiData.data.name || tokenAddress; // Use token name or address if name is missing
      const storedTokenInfo = updatedWatchlistTokenData[tokenAddress];
      const lastPrice = storedTokenInfo ? storedTokenInfo.lastPrice : undefined;

      console.log(`Fetched for ${tokenName} (${tokenAddress}): Current Price $${currentPrice}, Last Price $${lastPrice}`);

      if (lastPrice !== undefined && lastPrice !== null && currentPrice !== null) { // Ensure both prices are valid numbers
        if (lastPrice === 0 && currentPrice > 0) { // Avoid division by zero, treat as 100% change if price appears from 0
            const percentageChange = 100.00; // Arbitrary large change
             console.log(`Price for ${tokenName} appeared from $0 to $${currentPrice}. Triggering notification.`);
            triggerNotification(tokenAddress, tokenName, currentPrice, percentageChange);
        } else if (lastPrice > 0) { // Normal case, lastPrice is not zero
            const percentageChange = ((currentPrice - lastPrice) / lastPrice) * 100;
            if (Math.abs(percentageChange) >= 10) { // 10% change threshold
                console.log(`Significant price change for ${tokenName}: ${percentageChange.toFixed(2)}%. Triggering notification.`);
                triggerNotification(tokenAddress, tokenName, currentPrice, percentageChange);
            }
        }
      } else {
        console.log(`No last price for ${tokenName} or current price is null. Storing current price.`);
      }

      // Update stored price and name
      updatedWatchlistTokenData[tokenAddress] = { lastPrice: currentPrice, name: tokenName };
      await chrome.storage.local.set({ watchlistTokenData: updatedWatchlistTokenData });
      console.log(`Updated watchlistTokenData for ${tokenName}:`, updatedWatchlistTokenData[tokenAddress]);

    } else {
      console.warn(`No price data found for ${tokenAddress} in API response or unsuccessful API call.`, apiData);
       // If token was previously tracked but now returns no data, consider removing it or marking as error
       if (updatedWatchlistTokenData[tokenAddress]) {
           // delete updatedWatchlistTokenData[tokenAddress]; // Or keep old price but don't update
           // await chrome.storage.local.set({ watchlistTokenData: updatedWatchlistTokenData });
           console.log(`Kept old price for ${tokenAddress} as new fetch had no data.`);
       }
    }
  } catch (error) {
    console.error(`Error fetching or processing data for ${tokenAddress}:`, error);
    // Decide if you want to remove the token from watchlistTokenData on generic error
    // e.g., if (updatedWatchlistTokenData[tokenAddress]) { delete updatedWatchlistTokenData[tokenAddress]; ... }
  }
}

// --- Trigger Notification ---
function triggerNotification(tokenAddress, tokenName, currentPrice, percentageChange) {
  const notifId = `price-alert-${tokenAddress}-${Date.now()}`; // Unique ID for each notification
  const direction = percentageChange > 0 ? "increased" : "decreased";
  const absPercentageChange = Math.abs(percentageChange);

  const title = "Solana Token Price Alert!";
  const message = `${tokenName} price ${direction} by ${absPercentageChange.toFixed(2)}% to $${currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}.`;

  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'images/icon128.png',
    title: title,
    message: message,
    priority: 2 // Higher priority
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error("Notification creation failed:", chrome.runtime.lastError.message);
    } else {
      console.log(`Notification sent: ${notificationId}`);
    }
  });
}

// Log storage changes for debugging
chrome.storage.onChanged.addListener(function (changes, namespace) {
  for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
    console.log(
      `Storage key "${key}" in namespace "${namespace}" changed.`,
      `Old value was "${JSON.stringify(oldValue)}", new value is "${JSON.stringify(newValue)}".`
    );
  }
});
