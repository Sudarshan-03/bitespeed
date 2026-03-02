const express = require('express');
const router = express.Router();
const { identifyContact } = require('../controllers/identifyController');

router.post('/', identifyContact);

module.exports = router;
