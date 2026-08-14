const API_URL = 'http://localhost:3000/api';

// Helper: Fetch entries from backend
async function getEntries() {
  try {
    const res = await fetch(`${API_URL}/entries`);
    if (!res.ok) throw new Error('Failed to fetch entries');
    return await res.json();
  } catch (err) {
    console.error('[Growthy] Error fetching entries:', err);
    return [];
  }
}

// Helper: Get currently active session from backend (handles old/new API response structures)
async function getActiveSession() {
  try {
    const res = await fetch(`${API_URL}/sessions/active`);
    if (!res.ok) throw new Error('Failed to fetch active session');
    const data = await res.json();
    if (!data) return null;

    // Support both wrapped payload structure and direct session object
    if (data.activeSession !== undefined) {
      return data.activeSession;
    }
    return data;
  } catch (err) {
    console.error('[Growthy] Error fetching active session:', err);
    return null;
  }
}

// Helper: Send start signal to backend
async function startTimer(entryId) {
  try {
    const active = await getActiveSession();
    if (active && active.entryId) {
      const activeEntryId = active.entryId._id || active.entryId;
      if (activeEntryId === entryId) {
        console.log(`[Growthy] Timer already active for entry: ${entryId}. Skipping start request.`);
        return;
      }
    }

    const res = await fetch(`${API_URL}/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId })
    });
    if (res.ok) {
      console.log(`[Growthy] Started timer for entry: ${entryId}`);
    }
  } catch (err) {
    console.error('[Growthy] Error starting timer:', err);
  }
}

// Helper: Send stop signal to backend
async function stopTimer() {
  try {
    const active = await getActiveSession();
    if (!active) {
      // No active timer to stop
      return;
    }

    const res = await fetch(`${API_URL}/sessions/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      console.log('[Growthy] Stopped active timer.');
    }
  } catch (err) {
    console.error('[Growthy] Error stopping timer:', err);
  }
}

// Helper: Match tab URL to entry URL
function matchUrl(tabUrl, entryUrl) {
  if (!tabUrl || !entryUrl) return false;
  try {
    const tabObj = new URL(tabUrl);
    const entryObj = new URL(entryUrl);
    
    const tabHost = tabObj.hostname.replace('www.', '').toLowerCase();
    const entryHost = entryObj.hostname.replace('www.', '').toLowerCase();
    
    if (tabHost === entryHost) {
      // If entry has a path, check path starts with
      const entryPath = entryObj.pathname;
      if (entryPath === '/' || entryPath === '') {
        return true;
      }
      return tabObj.pathname.toLowerCase().startsWith(entryPath.toLowerCase());
    }
  } catch (e) {
    // String matching fallback
    return tabUrl.toLowerCase().includes(entryUrl.toLowerCase());
  }
  return false;
}

// Main logic: analyze tab focus state
async function checkActiveTab() {
  try {
    // Get active tab in the last focused window
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    
    // Check if the browser window is currently focused
    const lastFocusedWin = await chrome.windows.getLastFocused();
    if (!lastFocusedWin || !lastFocusedWin.focused) {
      console.log('[Growthy] Browser window lost focus. Pausing timer.');
      await stopTimer();
      return;
    }

    if (!activeTab || !activeTab.url) {
      console.log('[Growthy] No active tab URL. Pausing timer.');
      await stopTimer();
      return;
    }

    // Skip checking internal extension pages or chrome:// settings
    if (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://')) {
      await stopTimer();
      return;
    }

    // Fetch latest entries
    const entries = await getEntries();
    
    // Try to match URL
    const matchedEntry = entries.find(entry => matchUrl(activeTab.url, entry.url));

    if (matchedEntry) {
      console.log(`[Growthy] Tab matched entry "${matchedEntry.title}".`);
      await startTimer(matchedEntry._id);
    } else {


      console.log('[Growthy] Tab does not match any trackable. Pausing timer.');
      await stopTimer();
    }
  } catch (err) {
    console.error('[Growthy] Error in checkActiveTab:', err);
  }
}

// Event Listeners
chrome.tabs.onActivated.addListener(() => {
  checkActiveTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    checkActiveTab();
  }
});

chrome.windows.onFocusChanged.addListener(() => {
  checkActiveTab();
});

// Click extension action icon to open dashboard page
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'http://localhost:3000' });
});
