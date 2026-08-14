require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const Entry = require('./models/Entry');
const Session = require('./models/Session');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/growthy';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Helper: Format date to local YYYY-MM-DD
function getLocalYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * POST /api/entries
 * Body: { title, url }
 * Creates a new trackable Entry
 */
app.post('/api/entries', async (req, res) => {
  try {
    const { title, url } = req.body;
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required.' });
    }

    const entry = new Entry({ title, url });
    await entry.save();
    res.status(201).json(entry);
  } catch (error) {
    console.error('Error creating entry:', error);
    res.status(500).json({ error: 'Failed to create entry.' });
  }
});

/**
 * GET /api/entries
 * Returns all trackable Entries
 */
app.get('/api/entries', async (req, res) => {
  try {
    const entries = await Entry.find().sort({ createdAt: -1 });
    res.json(entries);
  } catch (error) {
    console.error('Error fetching entries:', error);
    res.status(500).json({ error: 'Failed to fetch entries.' });
  }
});

/**
 * POST /api/sessions/start
 * Body: { entryId }
 * Starts a timer for entryId. Stops any currently active timer first.
 */
app.post('/api/sessions/start', async (req, res) => {
  try {
    const { entryId } = req.body;
    if (!entryId) {
      return res.status(400).json({ error: 'entryId is required.' });
    }

    // Verify entry exists
    const entryExists = await Entry.findById(entryId);
    if (!entryExists) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    const now = new Date();

    // 1. Close any active sessions
    const activeSession = await Session.findOne({ endTime: null });
    if (activeSession) {
      activeSession.endTime = now;
      activeSession.durationSec = Math.max(0, Math.round((now - activeSession.startTime) / 1000));
      await activeSession.save();
    }

    // 2. Create the new active session
    const newSession = new Session({
      entryId,
      startTime: now,
      endTime: null,
      durationSec: 0,
      date: getLocalYYYYMMDD(now)
    });
    await newSession.save();

    res.status(201).json(newSession);
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session.' });
  }
});

/**
 * POST /api/sessions/stop
 * Body: none required
 * Stops the active session (if any)
 */
app.post('/api/sessions/stop', async (req, res) => {
  try {
    const now = new Date();
    const activeSession = await Session.findOne({ endTime: null });

    if (activeSession) {
      activeSession.endTime = now;
      activeSession.durationSec = Math.max(0, Math.round((now - activeSession.startTime) / 1000));
      await activeSession.save();
      return res.json(activeSession);
    }

    // Safe no-op if no active session
    res.json({ message: 'No active session found.' });
  } catch (error) {
    console.error('Error stopping session:', error);
    res.status(500).json({ error: 'Failed to stop session.' });
  }
});

/**
 * GET /api/sessions/today
 * Aggregates and returns today's tracking totals grouped by entryId
 */
app.get('/api/sessions/today', async (req, res) => {
  try {
    const todayStr = getLocalYYYYMMDD(new Date());

    // Aggregate closed sessions of today
    const aggregateResults = await Session.aggregate([
      { $match: { date: todayStr } },
      {
        $group: {
          _id: '$entryId',
          totalSeconds: { $sum: '$durationSec' }
        }
      },
      {
        $lookup: {
          from: 'entries',
          localField: '_id',
          foreignField: '_id',
          as: 'entry'
        }
      },
      { $unwind: { path: '$entry', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          entryId: '$_id',
          title: { $ifNull: ['$entry.title', 'Deleted Entry'] },
          totalSeconds: 1
        }
      }
    ]);

    res.json(aggregateResults);
  } catch (error) {
    console.error('Error fetching today\'s totals:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s totals.' });
  }
});

/**
 * GET /api/sessions/active
 * Returns the currently active Session (and accumulated seconds for its entry today), or null
 */
app.get('/api/sessions/active', async (req, res) => {
  try {
    const activeSession = await Session.findOne({ endTime: null }).populate('entryId');
    if (!activeSession) {
      return res.json(null);
    }

    // Calculate accumulated seconds for this entry today (excluding the active session itself)
    const todayStr = getLocalYYYYMMDD(new Date());
    const closedSessions = await Session.find({
      entryId: activeSession.entryId._id,
      date: todayStr,
      endTime: { $ne: null }
    });

    const accumulatedSecondsToday = closedSessions.reduce((sum, s) => sum + s.durationSec, 0);

    res.json({
      activeSession,
      accumulatedSecondsToday
    });
  } catch (error) {
    console.error('Error fetching active session:', error);
    res.status(500).json({ error: 'Failed to fetch active session.' });
  }
});

// Fallback index.html route for SPA behaviour or direct loads
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
