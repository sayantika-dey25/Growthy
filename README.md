# Growthy 🌱

Growthy is a simple, mindful time-tracker that helps you stay focused. It consists of two parts:
1. **Web Dashboard (`http://localhost:3000`):** A soft, clay-styled interface to view your daily focus totals and manage your tracked websites.
2. **Chrome Extension Helper:** Automatically starts the timer when you visit your tracked websites and pauses the timer when you get distracted (switch tabs, focus on dashboard, or close the browser).

---

## 🚀 How to Run the Web App

### 1. Install dependencies
Run this command in your terminal:
```bash
npm install
```

### 2. Set up your database
Create a `.env` file in the root folder (or copy `.env.example` to `.env`) and add your MongoDB URL:
```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/growthy
```

### 3. Start the server
Run this command:
```bash
npm run dev
```
Now, open `http://localhost:3000` in your web browser.

---

## 🧩 How to Install and Use the Chrome Extension

The extension tracks your active tabs in the background.

### 1. Load the extension in Chrome
1. Open Google Chrome and go to the address bar: **`chrome://extensions/`**
2. In the top-right corner, turn on **Developer mode**.
3. In the top-left corner, click **Load unpacked**.
4. Select the **`extension`** folder inside your Growthy project directory.

### 2. Pin the extension (Recommended)
Click the jigsaw puzzle icon in your Chrome toolbar next to the address bar, find **Growthy Focus Tracker**, and click the pin icon. 
* *Tip:* Clicking the pinned Growthy icon will open your Web Dashboard instantly in a new tab!

### 3. How to test it
1. Open the dashboard (`http://localhost:3000`) and add an activity (e.g. Title: `freeCodeCamp`, URL: `https://www.freecodecamp.org/`).
2. Open a new tab and go to `https://www.freecodecamp.org/`.
3. Switch back to the dashboard: you will see the active timer is automatically running and ticking up!
4. Go to any other tab (like `google.com`) or return to the dashboard: the timer will automatically pause itself.

### 4. How to update the extension (If code changes)
If you modify the extension's code:
1. Go back to **`chrome://extensions/`**.
2. Click the **Reload icon** (circular arrow) on the **Growthy Focus Tracker** card to apply updates.
3. If the card displays a red "Errors" button, click it, click **Clear all** in the top right to erase old logs, and go back.
