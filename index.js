const https = require('https');

// ── Team name mapping: API English name → group index ──
const GROUPS = {
  A: ['Mexico', 'South Africa', 'Korea Republic', 'Czechia'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['United States', 'Paraguay', 'Australia', 'Türkiye'],
  E: ['Germany', 'Curaçao', "Côte d'Ivoire", 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cabo Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
};

// Build lookup: "TeamA|TeamB" -> "g_X_N"
const PAIRS = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
const LOOKUP = {};
for (const [g, teams] of Object.entries(GROUPS)) {
  PAIRS.forEach(([a, b], mi) => {
    const key = `g_${g}_${mi}`;
    LOOKUP[`${teams[a]}|${teams[b]}`] = key;
    LOOKUP[`${teams[b]}|${teams[a]}`] = key;
  });
}

function getFirebaseKey(home, away) {
  return LOOKUP[`${home}|${away}`] || null;
}

function patchFirebase(data, firebaseUrl) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const url = new URL(firebaseUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function syncScores(matches, firebaseUrl) {
  const updates = {};
  let mapped = 0, skipped = 0;

  for (const match of matches) {
    if (match.status !== 'FINISHED') continue;
    const home = match.homeTeam?.name;
    const away = match.awayTeam?.name;
    const s1 = match.score?.fullTime?.home;
    const s2 = match.score?.fullTime?.away;
    if (!home || !away || s1 === null || s1 === undefined) { skipped++; continue; }
    const key = getFirebaseKey(home, away);
    if (!key) { console.log(`No key for: ${home} vs ${away}`); skipped++; continue; }
    updates[key] = { s1, s2 };
    mapped++;
  }

  console.log(`Mapped: ${mapped}, Skipped: ${skipped}`);
  console.log('Updates:', JSON.stringify(updates, null, 2));

  if (Object.keys(updates).length > 0) {
    const result = await patchFirebase(updates, firebaseUrl);
    console.log('Firebase response:', result.status, result.body);
    return { mapped, skipped, firebaseStatus: result.status, updates };
  }
  return { mapped, skipped, updates };
}

// ── Express server ──
const http = require('http');

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/sync') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const matches = payload.matches;
        const firebaseUrl = payload.firebaseUrl || 
          'https://polla-mundial-2026-chiri-default-rtdb.firebaseio.com/realScores.json';
        
        if (!matches || !Array.isArray(matches)) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'matches array required' }));
          return;
        }

        const result = await syncScores(matches, firebaseUrl);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch (e) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ ok: true, version: '1.0', tournament: 'WC2026' }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Score sync server running on port ${PORT}`));
