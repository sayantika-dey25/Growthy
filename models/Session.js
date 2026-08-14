const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  entryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entry',
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    default: null
  },
  durationSec: {
    type: Number,
    default: 0
  },
  date: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('Session', SessionSchema);
