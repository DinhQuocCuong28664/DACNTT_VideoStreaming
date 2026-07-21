require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const connectDB = require('./config/db'); // TODO: Implement in Phase 1

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes (Placeholders for Phase 1)
app.get('/', (req, res) => {
  res.json({ message: 'DACNTT Video Streaming API is running...' });
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // connectDB(); // TODO: Uncomment when db config is ready
});
