const { Database } = require('node-sqlite3-wasm');
const db = new Database('./__tests__/fixtures/resolution/.kimigraph/db.sqlite');

const addNode = db.all("SELECT id FROM nodes WHERE name = 'add' AND kind = 'function'");
console.log('add nodes:', addNode);

if (addNode.length > 0) {
  const id = addNode[0].id;
  const edges = db.all("SELECT * FROM edges WHERE target = ? AND kind = 'calls'", [id]);
  console.log('call edges to add:', edges.length);
  for (const e of edges) {
    const source = db.all("SELECT name, kind FROM nodes WHERE id = ?", [e.source]);
    console.log('  <-', source[0]?.kind, source[0]?.name);
  }
}

const sumThree = db.all("SELECT id FROM nodes WHERE name = 'sumThree'");
console.log('sumThree nodes:', sumThree);

if (sumThree.length > 0) {
  const id = sumThree[0].id;
  const edges = db.all("SELECT * FROM edges WHERE source = ? AND kind = 'calls'", [id]);
  console.log('call edges from sumThree:', edges.length);
  for (const e of edges) {
    const target = db.all("SELECT name, kind FROM nodes WHERE id = ?", [e.target]);
    console.log('  ->', target[0]?.kind, target[0]?.name);
  }
}

db.close();
