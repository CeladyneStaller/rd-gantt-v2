/* The engine the boards are built against, so the suites check numbers against the same code the boards
   carry: the repo's rdcore.js when calm/ sits inside rd-gantt-v2, else calm/engine/rdcore.js. build.py
   makes the same choice (ENGINE). */
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..', '..', 'rdcore.js');
module.exports = fs.existsSync(repo) ? repo : path.join(__dirname, '..', 'engine', 'rdcore.js');
