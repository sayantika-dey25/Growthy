// App State
let entries = [];
let activeSession = null;
let tickingInterval = null;
let tickSeconds = 0;
let rememberedEntryId = null; // Stores entryId when tab is hidden to resume on return

// DOM Elements
const addEntryForm = document.getElementById('add-entry-form');
const entryTitleInput = document.getElementById('entry-title');
const entryUrlInput = document.getElementById('entry-url');
const entriesList = document.getElementById('entries-list');
const totalsList = document.getElementById('totals-list');

// Active Timer DOM Elements
const activeTimerWidget = document.getElementById('active-timer-widget');
const activeEntryTitle = document.getElementById('active-entry-title');
const activeTimerDisplay = document.getElementById('active-timer-display');
const stopTimerBtn = document.getElementById('stop-timer-btn');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  await fetchEntries();
  await fetchTodayTotals();
  await syncActiveSession();

  // Setup Event Listeners
  addEntryForm.addEventListener('submit', handleAddEntry);
  stopTimerBtn.addEventListener('click', handleStopTimer);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Poll state every 3 seconds while dashboard is open and visible
  setInterval(async () => {
    if (!document.hidden) {
      await syncActiveSession();
      await fetchTodayTotals();
    }
  }, 3000);
  
  /*
   * beforeunload listener acts as a best-effort cleanup attempt to stop the running timer
   * if the browser/tab is closed. Note that browser sandboxing means beforeunload
   * is not 100% guaranteed to fire or complete, which is why GET /api/sessions/active
   * on next page load serves as the primary fallback and safety net for stale sessions.
   */
  window.addEventListener('beforeunload', () => {
    if (activeSession) {
      // Use keepalive: true to ensure the fetch survives page termination
      fetch('/api/sessions/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true
      });
    }
  });
}

// Format Helpers
function formatDuration(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  const paddedHrs = String(hrs).padStart(2, '0');
  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = String(secs).padStart(2, '0');
  
  return `${paddedHrs}:${paddedMins}:${paddedSecs}`;
}

function formatTodayDuration(totalSeconds) {
  const mins = totalSeconds / 60;
  if (mins === 0) return '0 mins';
  if (mins < 0.1) return '< 0.1 mins';
  if (mins % 1 === 0) {
    return `${mins} mins`;
  }
  return `${mins.toFixed(1)} mins`;
}

function extractDomain(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.hostname;
  } catch (e) {
    // If not a valid URL structure, return original truncated
    return urlStr.substring(0, 30);
  }
}

// API Interactions & Render Logic

// 1. Fetch & Render Entries
async function fetchEntries() {
  try {
    const response = await fetch('/api/entries');
    if (!response.ok) throw new Error('Failed to fetch entries.');
    entries = await response.json();
    renderEntries();
  } catch (error) {
    console.error('Error fetching entries:', error);
  }
}

function renderEntries() {
  if (entries.length === 0) {
    entriesList.innerHTML = `
      <div class="empty-state">
        <p>No trackables added yet. Fill in the form above to plant your first time seed!</p>
      </div>
    `;
    return;
  }

  const activeEntryId = (activeSession && activeSession.entryId) ? (activeSession.entryId._id || activeSession.entryId) : null;

  entriesList.innerHTML = entries.map(entry => {
    const isActive = activeEntryId === entry._id;
    return `
      <div class="entry-card ${isActive ? 'active-timer-border' : ''}">
        <div class="entry-card-info">
          <a href="${entry.url}" target="_blank" rel="noopener noreferrer" class="entry-card-title" title="Open Website">
            ${escapeHtml(entry.title)}
          </a>
          <span class="entry-card-url">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="12" height="12">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
            ${escapeHtml(extractDomain(entry.url))}
          </span>
        </div>
        <div class="entry-card-actions">
          ${isActive 
            ? `<button class="btn btn-active-tracking" disabled>
                 <span class="pulse-indicator" style="margin-right: 4px; display: inline-block; vertical-align: middle;"></span>
                 Active
               </button>`
            : `<button class="btn btn-start-tracking" onclick="handleStartTimer('${entry._id}')">Start</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

// 2. Fetch & Render Today's Totals
async function fetchTodayTotals() {
  try {
    const response = await fetch('/api/sessions/today');
    if (!response.ok) throw new Error('Failed to fetch today\'s totals.');
    const totals = await response.json();
    renderTodayTotals(totals);
  } catch (error) {
    console.error('Error fetching today\'s totals:', error);
  }
}

function renderTodayTotals(totals) {
  // Update the visual pie chart on the left
  renderPieChart(totals);

  if (totals.length === 0) {
    totalsList.innerHTML = `
      <div class="empty-totals">
        <p>No tracked time today yet. Hit "Start" on an activity to grow your hours.</p>
      </div>
    `;
    return;
  }

  // Sort totals descending by total seconds
  const sortedTotals = [...totals].sort((a, b) => b.totalSeconds - a.totalSeconds);

  totalsList.innerHTML = sortedTotals.map(item => `
    <div class="total-item">
      <span class="total-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
      <span class="total-item-time">${formatTodayDuration(item.totalSeconds)}</span>
    </div>
  `).join('');
}

// Draw claymorphic interactive SVG donut/pie chart
function renderPieChart(totals) {
  const pieChart = document.getElementById('pie-chart');
  if (!pieChart) return;
  
  if (totals.length === 0) {
    pieChart.style.background = '#e3efe3'; // Empty slate clay color
    pieChart.innerHTML = '<div class="pie-empty">🌱</div>';
    return;
  }
  
  const totalSeconds = totals.reduce((sum, item) => sum + item.totalSeconds, 0);
  if (totalSeconds === 0) {
    pieChart.style.background = '#e3efe3';
    pieChart.innerHTML = '<div class="pie-empty">🌱</div>';
    return;
  }
  
  // Clear CSS background style to let SVG draw
  pieChart.style.background = 'none';
  
  // Soft pastel clay colors
  const colors = [
    '#a3d9a5', // Pastel Green
    '#f2aeae', // Pastel Coral/Rose
    '#ffd8a8', // Pastel Orange
    '#c5cae9', // Pastel Blue-Grey
    '#b2ebf2', // Pastel Cyan
    '#e1bee7', // Pastel Purple
    '#fff9c4', // Pastel Yellow
    '#ffcdd2'  // Pastel Light-Coral
  ];
  
  const radius = 50;
  const circumference = 2 * Math.PI * radius; // ~314.16
  let accumulatedPercent = 0;
  
  const sortedTotals = [...totals].sort((a, b) => b.totalSeconds - a.totalSeconds);
  
  const circlesHtml = sortedTotals.map((item, index) => {
    const percent = item.totalSeconds / totalSeconds;
    const strokeDashArray = `${(percent * circumference).toFixed(2)} ${circumference.toFixed(2)}`;
    const strokeDashOffset = -(accumulatedPercent * circumference).toFixed(2);
    const color = colors[index % colors.length];
    
    accumulatedPercent += percent;
    
    const label = `${escapeHtml(item.title)}: ${formatTodayDuration(item.totalSeconds)}`;
    
    return `
      <circle 
        r="${radius}" 
        cx="70" 
        cy="70" 
        fill="transparent" 
        stroke="${color}" 
        stroke-width="18" 
        stroke-dasharray="${strokeDashArray}" 
        stroke-dashoffset="${strokeDashOffset}"
        transform="rotate(-90 70 70)"
        class="pie-slice"
        data-title="${escapeHtml(item.title)}"
        data-time="${formatTodayDuration(item.totalSeconds)}"
        style="cursor: pointer; transition: stroke-width 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease;"
      >
        <title>${label}</title>
      </circle>
    `;
  }).join('');
  
  const totalTimeFormatted = formatTodayDuration(totalSeconds);

  // Wrap in SVG container with center cutout and dynamic labels
  pieChart.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 140 140" style="overflow: visible;">
      <!-- Slices -->
      ${circlesHtml}
      
      <!-- Inner cutout for Donut shape (matches clay card background dynamically) -->
      <circle r="38" cx="70" cy="70" fill="var(--clay-card-bg)" style="transition: fill 0.3s ease;" />
      
      <!-- Dynamic Center Label -->
      <g id="pie-center-label" style="pointer-events: none;">
        <text x="70" y="66" text-anchor="middle" font-size="7" font-weight="700" fill="var(--text-secondary)" id="pie-center-title" style="font-family: inherit;">🌱</text>
        <text x="70" y="80" text-anchor="middle" font-size="9" font-weight="800" fill="var(--text-primary)" id="pie-center-value" style="font-family: inherit;">${totalTimeFormatted}</text>
      </g>
    </svg>
  `;
  
  // Attach hover/focus/click effects
  const slices = pieChart.querySelectorAll('.pie-slice');
  const centerTitle = document.getElementById('pie-center-title');
  const centerValue = document.getElementById('pie-center-value');
  
  slices.forEach(slice => {
    const title = slice.getAttribute('data-title');
    const time = slice.getAttribute('data-time');
    
    const showDetails = () => {
      // Truncate title if needed
      const displayTitle = title.length > 13 ? title.substring(0, 11) + '..' : title;
      centerTitle.textContent = displayTitle;
      centerValue.textContent = time;
      slice.style.strokeWidth = '22'; // Visual pop-out
      slice.style.opacity = '0.9';
    };
    
    const hideDetails = () => {
      centerTitle.textContent = '🌱';
      centerValue.textContent = totalTimeFormatted;
      slice.style.strokeWidth = '18';
      slice.style.opacity = '1';
    };
    
    slice.addEventListener('mouseover', showDetails);
    slice.addEventListener('mouseout', hideDetails);
    slice.addEventListener('click', showDetails);
  });
}

// 3. Sync Active Timer State
async function syncActiveSession() {
  try {
    const response = await fetch('/api/sessions/active');
    if (!response.ok) throw new Error('Failed to fetch active session.');
    const data = await response.json();
    
    if (data && data.activeSession) {
      activeSession = data.activeSession;
      const accumulated = data.accumulatedSecondsToday || 0;
      
      // Extract entry details depending on population
      const entry = activeSession.entryId;
      const title = entry ? entry.title : 'Unknown Entry';
      
      activeEntryTitle.textContent = title;
      
      // Compute correct initial elapsed duration of current session to offset latency
      const startMs = new Date(activeSession.startTime).getTime();
      const currentMs = Date.now();
      const sessionElapsed = Math.max(0, Math.floor((currentMs - startMs) / 1000));
      
      // Cumulative time spent today
      tickSeconds = accumulated + sessionElapsed;
      
      activeTimerDisplay.textContent = formatDuration(tickSeconds);
      activeTimerWidget.classList.remove('hidden');

      // Start the ticking animation loop
      if (tickingInterval) clearInterval(tickingInterval);
      tickingInterval = setInterval(() => {
        tickSeconds++;
        activeTimerDisplay.textContent = formatDuration(tickSeconds);
      }, 1000);
    } else {
      activeSession = null;
      // Shut down timer ticking
      if (tickingInterval) {
        clearInterval(tickingInterval);
        tickingInterval = null;
      }
      activeTimerWidget.classList.add('hidden');
      activeEntryTitle.textContent = 'None';
      activeTimerDisplay.textContent = '00:00:00';
    }

    // Refresh buttons state in list
    renderEntries();
  } catch (error) {
    console.error('Error syncing active session:', error);
  }
}

// Action Handlers

// Add New Entry
async function handleAddEntry(e) {
  e.preventDefault();
  
  const title = entryTitleInput.value.trim();
  const url = entryUrlInput.value.trim();

  if (!title || !url) return;

  try {
    const response = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, url })
    });

    if (!response.ok) throw new Error('Failed to create entry.');
    
    // Clear Form inputs
    entryTitleInput.value = '';
    entryUrlInput.value = '';
    
    // Refresh list of entries
    await fetchEntries();
  } catch (error) {
    console.error('Error adding entry:', error);
    alert('Failed to add activity. Please try again.');
  }
}

// Start Timer
async function handleStartTimer(entryId) {
  try {
    const response = await fetch('/api/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId })
    });

    if (!response.ok) throw new Error('Failed to start timer.');
    
    // Trigger updates
    await syncActiveSession();
    await fetchTodayTotals();
  } catch (error) {
    console.error('Error starting timer:', error);
  }
}

// Stop Timer
async function handleStopTimer() {
  try {
    const response = await fetch('/api/sessions/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) throw new Error('Failed to stop timer.');
    
    // Trigger updates
    await syncActiveSession();
    await fetchTodayTotals();
  } catch (error) {
    console.error('Error stopping timer:', error);
  }
}

// Visibility change event handling: sync UI when dashboard is focused
async function handleVisibilityChange() {
  if (!document.hidden) {
    await syncActiveSession();
    await fetchTodayTotals();
  }
}

// Simple HTML escaping helper for security
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.handleStartTimer = handleStartTimer; // Expose to global scope for inline button onclick attributes
