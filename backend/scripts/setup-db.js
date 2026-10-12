'use strict';
/* Creates the database file and applies every migration (safe to re-run). */
const config = require('../src/config');
const db = require('../src/models/db');
db.open();
const { seedDefaults } = require('../src/services/seedService');
if (seedDefaults()) console.log('Loaded the default site content (database/defaults.json).');
const rows = db.get().prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
console.log('Database ready at', config.DATABASE_FILE);
rows.forEach((r) => console.log(`  migration ${r.version}: ${r.name}`));
db.close();
