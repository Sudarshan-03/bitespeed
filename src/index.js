const express = require('express');
const identifyRoutes = require('./routes/identify');

const app = express();

app.use(express.json());

// Routes
app.use('/identify', identifyRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
