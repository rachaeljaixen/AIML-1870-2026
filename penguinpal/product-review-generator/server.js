require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const generateRoute = require('./routes/generate');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/generate', generateRoute);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
