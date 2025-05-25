document.addEventListener('DOMContentLoaded', function() {
  console.log("Popup script loaded.");
  const fetchButton = document.getElementById('fetchButton');
  const tokenAddressInput = document.getElementById('tokenAddress');

  if (fetchButton) {
    fetchButton.addEventListener('click', function() {
      const tokenAddress = tokenAddressInput.value.trim();
      if (tokenAddress) {
        fetchTokenData(tokenAddress);
      } else {
        displayError("Please enter a token address.");
      }
    });
  } else {
    console.error("Fetch button not found.");
  }

  // Load last searched token and fetch data
  chrome.storage.local.get(['lastSearchedToken'], function(result) {
    if (result.lastSearchedToken) {
      tokenAddressInput.value = result.lastSearchedToken;
      fetchTokenData(result.lastSearchedToken);
    }
  });

  const refreshNewTokensButton = document.getElementById('refreshNewTokensButton');
  if (refreshNewTokensButton) {
    refreshNewTokensButton.addEventListener('click', fetchNewTokens);
  }

  // Fetch new tokens when the popup loads
  fetchNewTokens(); 

  const addToWatchlistButton = document.getElementById('addToWatchlistButton');
  if (addToWatchlistButton) {
    addToWatchlistButton.addEventListener('click', handleAddToWatchlist);
  }

  const watchlistedTokensDiv = document.getElementById('watchlistedTokens');
  if (watchlistedTokensDiv) {
    watchlistedTokensDiv.addEventListener('click', handleWatchlistActions);
  }

  // Load the watchlist when the popup opens
  loadWatchlist();
});

async function fetchTokenData(tokenAddress) {
  const errorMessageDiv = document.getElementById('errorMessage');
  // Select the span inside the info-item divs for market data
  const tokenPriceSpan = document.querySelector('#tokenPrice span');
  const marketCapSpan = document.querySelector('#marketCap span');
  const tradingVolumeSpan = document.querySelector('#tradingVolume span');
  const liquiditySpan = document.querySelector('#liquidity span');
  
  const topHoldersDiv = document.getElementById('topHolders');
  const renouncedOwnershipCheckbox = document.getElementById('renouncedOwnership');
  const auditLinkInput = document.getElementById('auditLink');
  const watchlistMessageDiv = document.getElementById('watchlistMessage');
  const memeScoreDisplayDiv = document.getElementById('memeScoreDisplay');
  
  // Select the span inside the info-item divs for social signals
  const twitterMentionsSpan = document.querySelector('#twitterMentions span');
  const twitterSentimentSpan = document.querySelector('#twitterSentiment span');

  // Clear previous error messages and reset UI elements
  errorMessageDiv.textContent = '';
  errorMessageDiv.style.display = 'none'; // Hide error div
  watchlistMessageDiv.textContent = ''; 
  watchlistMessageDiv.className = ''; // Clear any success/error classes

  memeScoreDisplayDiv.textContent = 'Meme Score: -'; 
  
  // Reset market data with loading text
  tokenPriceSpan.textContent = 'Loading...';
  marketCapSpan.textContent = 'Loading...';
  tradingVolumeSpan.textContent = 'Loading...';
  liquiditySpan.textContent = 'Loading...';
  
  topHoldersDiv.innerHTML = '<p class="loading-text">Loading Top Holders...</p>'; 
  renouncedOwnershipCheckbox.checked = false; 
  auditLinkInput.value = ''; 
  
  // Reset social data with loading text
  twitterMentionsSpan.textContent = 'Loading...';
  twitterSentimentSpan.textContent = 'Loading...';

  window.currentBirdeyeData = null; 

  const birdeyeApiUrl = `https://public-api.birdeye.so/public/defi/v2/token_overview?address=${tokenAddress}`;
  try {
    const response = await fetch(birdeyeApiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} for Birdeye`);
    }
    const apiResponse = await response.json(); 

    if (apiResponse && apiResponse.success && apiResponse.data) {
      window.currentBirdeyeData = apiResponse.data; 
      tokenPriceSpan.textContent = `$${formatNumber(window.currentBirdeyeData.price)}`;
      marketCapSpan.textContent = `$${formatNumber(window.currentBirdeyeData.mc)}`;
      tradingVolumeSpan.textContent = `$${formatNumber(window.currentBirdeyeData.v24hUSD)}`;
      liquiditySpan.textContent = `$${formatNumber(window.currentBirdeyeData.liquidity)}`;

      chrome.storage.local.set({lastSearchedToken: tokenAddress}, function() {
        console.log('Last searched token saved:', tokenAddress);
      });

      fetchSolscanTokenHolders(tokenAddress, window.currentBirdeyeData);
      
      if (window.currentBirdeyeData.symbol) {
        fetchSocialMentions(window.currentBirdeyeData.symbol);
      } else if (window.currentBirdeyeData.name) {
        fetchSocialMentions(window.currentBirdeyeData.name);
      } else {
         twitterMentionsSpan.textContent = 'N/A (no symbol/name)';
         twitterSentimentSpan.textContent = 'N/A';
      }
    } else {
      tokenPriceSpan.textContent = 'N/A';
      marketCapSpan.textContent = 'N/A';
      tradingVolumeSpan.textContent = 'N/A';
      liquiditySpan.textContent = 'N/A';
      throw new Error("Invalid token address or Birdeye API response format.");
    }
  } catch (error) {
    console.error("Error fetching Birdeye token data:", error);
    displayError(`Birdeye API Error: ${error.message}`);
    tokenPriceSpan.textContent = 'Error';
    marketCapSpan.textContent = 'Error';
    tradingVolumeSpan.textContent = 'Error';
    liquiditySpan.textContent = 'Error';
    topHoldersDiv.innerHTML = '<p class="loading-text">Error loading holders.</p>';
    const score = calculateMemeScore(window.currentBirdeyeData, null); // currentBirdeyeData might be null
    memeScoreDisplayDiv.textContent = `Meme Score: ${score}/100`;
    twitterMentionsSpan.textContent = 'Error';
    twitterSentimentSpan.textContent = 'Error';
  }
}

async function fetchSolscanTokenHolders(tokenAddress, birdeyeDataForScore) { 
  const topHoldersDiv = document.getElementById('topHolders');
  const memeScoreDisplayDiv = document.getElementById('memeScoreDisplay'); // Already selected, but good for clarity
  const solscanApiUrl = `https://public-api.solscan.io/token/holders?tokenAddress=${tokenAddress}&offset=0&limit=5`;
  let solscanDataForScore = null;
  topHoldersDiv.innerHTML = '<p class="loading-text">Loading Top Holders...</p>'; // Set loading state

  try {
    const response = await fetch(solscanApiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} for Solscan`);
    }
    solscanDataForScore = await response.json(); 

    if (solscanDataForScore && Array.isArray(solscanDataForScore) && solscanDataForScore.length > 0) { 
      let htmlContent = '<ul>'; // Removed <strong> for direct list
      solscanDataForScore.forEach(holder => {
        const address = holder.owner || holder.address || 'Unknown Address';
        const percentage = holder.percentage !== undefined ? holder.percentage.toFixed(2) : (holder.percent !== undefined ? holder.percent.toFixed(2) : 'N/A');
        htmlContent += `<li>${address}: ${percentage}%</li>`;
      });
      htmlContent += '</ul>';
      topHoldersDiv.innerHTML = htmlContent;
    } else if (solscanDataForScore && Array.isArray(solscanDataForScore) && solscanDataForScore.length === 0) {
      topHoldersDiv.innerHTML = '<p>No holder data found on Solscan.</p>';
    }
    else {
      console.warn("Solscan API response was not an array or was empty:", solscanDataForScore);
      throw new Error("Invalid Solscan API response format or no holders found.");
    }
  } catch (error) {
    console.error("Error fetching Solscan token holders:", error);
    topHoldersDiv.innerHTML = `<p class="loading-text">Error loading holders: ${error.message}</p>`;
  } finally {
    const score = calculateMemeScore(birdeyeDataForScore, solscanDataForScore);
    memeScoreDisplayDiv.textContent = `Meme Score: ${score}/100`;
  }
}


async function fetchSocialMentions(tokenSymbolOrName) {
  const twitterMentionsSpan = document.querySelector('#twitterMentions span');
  const twitterSentimentSpan = document.querySelector('#twitterSentiment span');
  twitterMentionsSpan.textContent = 'Loading...';
  twitterSentimentSpan.textContent = 'Loading...';

  const encodedTerm = encodeURIComponent(tokenSymbolOrName);
  const socialApiUrl = `https://api.social-listening-service.com/mentions?term=${encodedTerm}`;

  try {
    console.log(`Simulating fetch to: ${socialApiUrl}`);
    await new Promise(resolve => setTimeout(resolve, 1000)); 

    let data;
    if (tokenSymbolOrName.toLowerCase() === "wen" || tokenSymbolOrName.toLowerCase() === "bonk") { 
      data = {
        term: tokenSymbolOrName,
        mentions_last_24h: Math.floor(Math.random() * 1000) + 50, 
        sentiment_score: Math.random() * 0.8 + 0.1 
      };
    } else if (tokenSymbolOrName.toLowerCase() === "errorcoin") {
         throw new Error("Simulated API error for ErrorCoin");
    }
    else { 
      data = {
        term: tokenSymbolOrName,
        mentions_last_24h: 0,
        sentiment_score: null
      };
    }
    
    if (data) {
      twitterMentionsSpan.textContent = `${data.mentions_last_24h !== undefined ? data.mentions_last_24h : 'N/A'}`;
      if (data.sentiment_score !== undefined && data.sentiment_score !== null) {
        let sentimentText = 'Neutral';
        if (data.sentiment_score > 0.65) sentimentText = 'Positive';
        else if (data.sentiment_score < 0.35) sentimentText = 'Negative';
        twitterSentimentSpan.textContent = `${sentimentText} (${data.sentiment_score.toFixed(2)})`;
      } else {
        twitterSentimentSpan.textContent = 'N/A';
      }
    } else {
      twitterMentionsSpan.textContent = 'N/A (No data)';
      twitterSentimentSpan.textContent = 'N/A';
    }
  } catch (error) {
    console.error("Error fetching social mentions:", error);
    twitterMentionsSpan.textContent = 'Error';
    twitterSentimentSpan.textContent = 'Error';
  }
}

function calculateMemeScore(birdeyeData, solscanData) {
  let liquidityScore = 0;
  let volumeScore = 0;
  let holderScore = 0;

  if (birdeyeData && birdeyeData.liquidity !== undefined) {
    const liquidity = birdeyeData.liquidity;
    if (liquidity > 50000) liquidityScore = 40;
    else if (liquidity >= 10000) liquidityScore = 30;
    else if (liquidity >= 5000) liquidityScore = 20;
    else if (liquidity >= 1000) liquidityScore = 10;
  }

  if (birdeyeData && birdeyeData.v24hUSD !== undefined) {
    const v24hUSD = birdeyeData.v24hUSD;
    if (v24hUSD > 100000) volumeScore = 40;
    else if (v24hUSD >= 20000) volumeScore = 30;
    else if (v24hUSD >= 5000) volumeScore = 20;
    else if (v24hUSD >= 1000) volumeScore = 10;
  }

  if (solscanData && Array.isArray(solscanData) && solscanData.length > 0) {
    let top5HolderPercentageSum = 0;
    for (let i = 0; i < Math.min(solscanData.length, 5); i++) {
      const perc = solscanData[i].percentage !== undefined ? solscanData[i].percentage : (solscanData[i].percent !== undefined ? solscanData[i].percent : 0);
      top5HolderPercentageSum += parseFloat(perc) || 0; // Ensure perc is a number
    }

    if (top5HolderPercentageSum < 30) holderScore = 20;
    else if (top5HolderPercentageSum <= 50) holderScore = 10;
  }

  return liquidityScore + volumeScore + holderScore;
}

async function fetchNewTokens() {
  const newTokensListDiv = document.getElementById('newTokensList');
  newTokensListDiv.innerHTML = '<p class="loading-text">Loading new tokens...</p>'; 

  const birdeyeNewTokensApiUrl = `https://public-api.birdeye.so/public/tokenlist?sort_by=created_at&sort_type=desc&offset=0&limit=10`; 

  try {
    const response = await fetch(birdeyeNewTokensApiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (data && data.success && data.data && data.data.tokens && Array.isArray(data.data.tokens) && data.data.tokens.length > 0) {
      let htmlContent = '<ul>'; // Removed <strong> for direct list
      data.data.tokens.forEach(token => {
        const name = token.name || 'Unnamed Token';
        const symbol = token.symbol || 'N/A';
        const address = token.address;
        const createdAt = token.created_at ? new Date(token.created_at * 1000).toLocaleString() : 'Unknown time';

        htmlContent += `
          <li>
            <div>
              <strong>${name} (${symbol})</strong> - Created: ${createdAt}
            </div>
            <a href="#" data-address="${address}" class="new-token-link">${address}</a>
          </li>`;
      });
      htmlContent += '</ul>';
      newTokensListDiv.innerHTML = htmlContent;

      document.querySelectorAll('.new-token-link').forEach(link => {
        link.addEventListener('click', function(event) {
          event.preventDefault();
          const tokenAddress = this.getAttribute('data-address');
          const tokenAddressInput = document.getElementById('tokenAddress');
          const fetchButton = document.getElementById('fetchButton');
          if (tokenAddressInput && fetchButton) {
            tokenAddressInput.value = tokenAddress;
            fetchButton.click(); 
          }
        });
      });

    } else if (data && data.success && data.data && data.data.tokens && data.data.tokens.length === 0) {
      newTokensListDiv.innerHTML = '<p>No new tokens found in the last 24 hours.</p>';
    } else {
      console.warn("Birdeye new tokens API response was not as expected:", data);
      throw new Error("Invalid API response format or no new tokens found.");
    }
  } catch (error) {
    console.error("Error fetching new tokens from Birdeye:", error);
    newTokensListDiv.innerHTML = `<p class="loading-text">Error loading new tokens: ${error.message}</p>`;
  }
}

function handleAddToWatchlist() {
  const tokenAddressInput = document.getElementById('tokenAddress');
  const watchlistMessageDiv = document.getElementById('watchlistMessage');
  const address = tokenAddressInput.value.trim();

  if (!address) {
    displayWatchlistMessage("Please enter a token address first.", true);
    return;
  }

  chrome.storage.local.get({watchlist: []}, function(result) {
    let watchlist = result.watchlist;
    if (watchlist.includes(address)) {
      displayWatchlistMessage("Already in watchlist.", false); // Already exists, not an error
    } else {
      watchlist.push(address);
      chrome.storage.local.set({watchlist: watchlist}, function() {
        if (chrome.runtime.lastError) {
          console.error("Error saving to watchlist:", chrome.runtime.lastError);
          displayWatchlistMessage("Error saving to watchlist.", true);
        } else {
          displayWatchlistMessage("Added to watchlist!", false);
          loadWatchlist(); // Refresh the list
        }
      });
    }
  });
}

function loadWatchlist() {
  const watchlistedTokensDiv = document.getElementById('watchlistedTokens');
  watchlistedTokensDiv.innerHTML = '<p class="loading-text">Loading watchlist...</p>'; // Initial loading message

  chrome.storage.local.get({watchlist: []}, function(result) {
    const watchlist = result.watchlist;
    
    if (watchlist.length === 0) {
      watchlistedTokensDiv.innerHTML = '<p>Your watchlist is empty.</p>';
      return;
    }

    let htmlContent = '<ul>';
    watchlist.forEach(address => {
      htmlContent += `
        <li>
          <a href="#" data-address="${address}" class="watchlist-token-link">${address}</a>
          <button data-address="${address}" class="remove-watchlist-token">Remove</button>
        </li>`;
    });
    htmlContent += '</ul>';
    watchlistedTokensDiv.innerHTML = htmlContent;
  });
}

function handleWatchlistActions(event) {
  const target = event.target;
  const tokenAddressInput = document.getElementById('tokenAddress');
  const fetchButton = document.getElementById('fetchButton');

  if (target.classList.contains('watchlist-token-link')) {
    event.preventDefault();
    const address = target.dataset.address;
    if (tokenAddressInput && fetchButton) {
      tokenAddressInput.value = address;
      fetchButton.click(); // Trigger main data fetch for this token
    }
  } else if (target.classList.contains('remove-watchlist-token')) {
    const addressToRemove = target.dataset.address;
    chrome.storage.local.get({watchlist: []}, function(result) {
      let watchlist = result.watchlist.filter(addr => addr !== addressToRemove);
      chrome.storage.local.set({watchlist: watchlist}, function() {
        if (chrome.runtime.lastError) {
          console.error("Error removing from watchlist:", chrome.runtime.lastError);
          displayWatchlistMessage("Error removing token.", true);
        } else {
          displayWatchlistMessage("Token removed from watchlist.", false);
          loadWatchlist(); // Refresh the list
        }
      });
    });
  }
}

function displayWatchlistMessage(message, isError = false) {
  const watchlistMessageDiv = document.getElementById('watchlistMessage');
  if (watchlistMessageDiv) {
    watchlistMessageDiv.textContent = message;
    watchlistMessageDiv.className = isError ? 'error' : 'success'; // Use classes for styling
    setTimeout(() => {
      watchlistMessageDiv.textContent = '';
      watchlistMessageDiv.className = '';
    }, 3000); 
  }
}

function displayError(message) {
  const errorMessageDiv = document.getElementById('errorMessage');
  if (errorMessageDiv) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = 'block'; // Show error div
  }
}

function formatNumber(num) {
  if (num === undefined || num === null || isNaN(num)) return 'N/A';
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
