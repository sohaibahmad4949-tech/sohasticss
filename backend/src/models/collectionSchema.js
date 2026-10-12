'use strict';
/* Pure description of the six list-type content collections and how each one maps to a SQL table.
   (No database access here, so migrations and models can both import it.)

   key      = the name the website's CMS uses for the list ("portfolio", "services", ...)
   table    = SQL table name
   cols     = { jsonField: { col, type } }  -  JSON field names the website uses, mapped to real columns.
   Any field not listed (and not id/published/createdAt/updatedAt) is kept in the `extra` JSON column,
   so nothing an admin saves is ever silently dropped. */
const T = (col, type = 'text') => ({ col, type });

const SCHEMAS = {
  portfolio: {
    table: 'projects', prefix: 'p',
    cols: { title: T('title'), category: T('category'), desc: T('description'), tc: T('tc'), tone: T('tone'), image: T('image', 'nullable'), video: T('video'), featured: T('featured', 'bool') }
  },
  websites: {
    table: 'websites', prefix: 'ws',
    cols: { title: T('title'), category: T('category'), price: T('price'), desc: T('description'), video: T('video'), image: T('image', 'nullable'), featured: T('featured', 'bool') }
  },
  services: {
    table: 'services', prefix: 'svc',
    cols: { title: T('title'), desc: T('description'), price: T('price'), unit: T('unit'), icon: T('icon') }
  },
  awards: {
    table: 'awards', prefix: 'aw',
    cols: { title: T('title'), year: T('year'), org: T('org'), desc: T('description'), icon: T('icon') }
  },
  milestones: {
    table: 'milestones', prefix: 'ms',
    cols: { title: T('title'), year: T('year'), desc: T('description'), icon: T('icon') }
  },
  skills: {
    table: 'skills', prefix: 'sk',
    cols: { name: T('name'), value: T('value', 'int') }
  }
};

const BY_KEY = SCHEMAS;
const KEYS = Object.keys(SCHEMAS);
const RESERVED = new Set(['id', 'published', 'createdAt', 'updatedAt', 'order']);

function createTableSql(schema) {
  const defs = Object.values(schema.cols).map(({ col, type }) => {
    if (type === 'bool') return `${col} INTEGER NOT NULL DEFAULT 0 CHECK (${col} IN (0,1))`;
    if (type === 'int') return `${col} INTEGER NOT NULL DEFAULT 0`;
    if (type === 'nullable') return `${col} TEXT`;
    return `${col} TEXT NOT NULL DEFAULT ''`;
  });
  const t = schema.table;
  const hasFeatured = Object.values(schema.cols).some((c) => c.col === 'featured');
  return `
    CREATE TABLE ${t} (
      id         TEXT PRIMARY KEY,
      position   INTEGER NOT NULL DEFAULT 0,
      published  INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),
      ${defs.join(',\n      ')},
      extra      TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_${t}_position ON ${t}(position);
    CREATE INDEX idx_${t}_published ON ${t}(published, position);
    ${hasFeatured ? `CREATE INDEX idx_${t}_featured ON ${t}(featured, position);` : ''}`;
}

module.exports = { SCHEMAS, BY_KEY, KEYS, RESERVED, createTableSql };
