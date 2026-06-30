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

// ── KNOCKOUT STAGE ──
// R32 results are fixed pairings (set before tournament).
// R16/QF/SF/Final pairings are built DYNAMICALLY from R32/R16/etc winners,
// because the actual teams aren't known until earlier rounds finish.

const R32_MATCHES = [
  { home: 'South Africa', away: 'Canada',    key: 'r32_0' },
  { home: 'Brazil',       away: 'Japan',     key: 'r32_1' },
  { home: 'Germany',      away: 'Paraguay',  key: 'r32_2' },
  { home: 'Netherlands',  away: 'Morocco',   key: 'r32_3' },
  { home: "Côte d'Ivoire",away: 'Norway',    key: 'r32_4' },
  { home: 'France',       away: 'Sweden',    key: 'r32_5' },
  { home: 'Mexico',       away: 'Ecuador',   key: 'r32_6' },
  { home: 'England',      away: 'DR Congo',  key: 'r32_7' },
  { home: 'Belgium',      away: 'Senegal',   key: 'r32_8' },
  { home: 'United States',away: 'Bosnia and Herzegovina', key: 'r32_9' },
  { home: 'Spain',        away: 'Austria',   key: 'r32_10' },
  { home: 'Switzerland',  away: 'Algeria',   key: 'r32_11' },
  { home: 'Portugal',     away: 'Croatia',   key: 'r32_12' },
  { home: 'Australia',    away: 'Egypt',     key: 'r32_13' },
  { home: 'Argentina',    away: 'Cabo Verde',key: 'r32_14' },
  { home: 'Colombia',     away: 'Ghana',     key: 'r32_15' },
];

// R16 bracket structure: which R32 match indices feed each R16 match.
// Pairing confirmed by FIFA bracket (see worldcuppass.com/CBS bracket):
//  r16_0: winner(r32_2 Germany/Paraguay) vs winner(r32_5 France/Sweden)
//  r16_1: winner(r32_0 SouthAfrica/Canada) vs winner(r32_3 Netherlands/Morocco)
//  r16_2: winner(r32_1 Brazil/Japan) vs winner(r32_4 CotedIvoire/Norway)
//  r16_3: winner(r32_6 Mexico/Ecuador) vs winner(r32_7 England/DRCongo)
//  r16_4: winner(r32_12 Portugal/Croatia) vs winner(r32_10 Spain/Austria)
//  r16_5: winner(r32_9 US/Bosnia) vs winner(r32_8 Belgium/Senegal)
//  r16_6: winner(r32_14 Argentina/CaboVerde) vs winner(r32_13 Australia/Egypt)
//  r16_7: winner(r32_11 Switzerland/Algeria) vs winner(r32_15 Colombia/Ghana)
const R16_FEED = [
  [2, 5], [0, 3], [1, 4], [6, 7],
  [12, 10], [9, 8], [14, 13], [11, 15],
];

// QF bracket: which R16 match indices feed each QF
const QF_FEED = [[0,1],[2,3],[4,5],[6,7]];

// SF bracket: which QF match indices feed each SF
const SF_FEED = [[0,1],[2,3]];

// Build R32 lookup (fixed)
const KO_LOOKUP = {};
R32_MATCHES.forEach(m => {
  KO_LOOKUP[`${m.home}|${m.away}`] = { key: m.key, homeIsFirst: true };
  KO_LOOKUP[`${m.away}|${m.home}`] = { key: m.key, homeIsFirst: false };
});

// Resolve a team name from an R32-style match given current realScores + team names
function winnerOf(matchKey, homeTeam, awayTeam, realScores) {
  const rs = realScores[matchKey];
  if (!rs || rs.s1 === undefined || rs.s2 === undefined) return null;
  return rs.s1 > rs.s2 ? homeTeam : awayTeam;
}

// Given current realScores AND the list of all matches fetched from the API
// (to resolve team names for R32), dynamically build R16/QF/SF/Final lookups.
function buildDynamicLookups(realScores) {
  // First resolve R32 winners by team name
  const r32Winners = R32_MATCHES.map(m => {
    const rs = realScores[m.key];
    if (!rs || rs.s1 === undefined || rs.s2 === undefined) return null;
    return rs.s1 > rs.s2 ? m.home : m.away;
  });

  const lookup = {};

  // R16
  const r16Winners = R16_FEED.map((pair, idx) => {
    const t1 = r32Winners[pair[0]];
    const t2 = r32Winners[pair[1]];
    if (!t1 || !t2) return null;
    const key = `r16_${idx}`;
    lookup[`${t1}|${t2}`] = { key, homeIsFirst: true };
    lookup[`${t2}|${t1}`] = { key, homeIsFirst: false };
    const rs = realScores[key];
    if (!rs || rs.s1 === undefined) return null;
    return rs.s1 > rs.s2 ? t1 : t2;
  });

  // QF
  const qfWinners = QF_FEED.map((pair, idx) => {
    const t1 = r16Winners[pair[0]];
    const t2 = r16Winners[pair[1]];
    if (!t1 || !t2) return null;
    const key = `qf_${idx}`;
    lookup[`${t1}|${t2}`] = { key, homeIsFirst: true };
    lookup[`${t2}|${t1}`] = { key, homeIsFirst: false };
    const rs = realScores[key];
    if (!rs || rs.s1 === undefined) return null;
    return rs.s1 > rs.s2 ? t1 : t2;
  });

  // SF
  const sfWinners = SF_FEED.map((pair, idx) => {
    const t1 = qfWinners[pair[0]];
    const t2 = qfWinners[pair[1]];
    if (!t1 || !t2) return null;
    const key = `sf_${idx}`;
    lookup[`${t1}|${t2}`] = { key, homeIsFirst: true };
    lookup[`${t2}|${t1}`] = { key, homeIsFirst: false };
    const rs = realScores[key];
    if (!rs || rs.s1 === undefined) return null;
    return rs.s1 > rs.s2 ? t1 : t2;
  });

  // Final + 3rd place
  if (sfWinners[0] && sfWinners[1]) {
    lookup[`${sfWinners[0]}|${sfWinners[1]}`] = { key: 'final_0', homeIsFirst: true };
    lookup[`${sfWinners[1]}|${sfWinners[0]}`] = { key: 'final_0', homeIsFirst: false };
  }
  // 3rd place: losers of SF
  const sfLosers = SF_FEED.map((pair, idx) => {
    const t1 = qfWinners[pair[0]], t2 = qfWinners[pair[1]];
    const rs = realScores[`sf_${idx}`];
    if (!t1 || !t2 || !rs || rs.s1 === undefined) return null;
    return rs.s1 > rs.s2 ? t2 : t1; // loser
  });
  if (sfLosers[0] && sfLosers[1]) {
    lookup[`${sfLosers[0]}|${sfLosers[1]}`] = { key: '3rd_0', homeIsFirst: true };
    lookup[`${sfLosers[1]}|${sfLosers[0]}`] = { key: '3rd_0', homeIsFirst: false };
  }

  return lookup;
}

// Build lookup: "TeamA|TeamB" -> { key, homeIsFirst }
const PAIRS = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
const LOOKUP = {};
for (const [g, teams] of Object.entries(GROUPS)) {
  PAIRS.forEach(([a, b], mi) => {
    const key = `g_${g}_${mi}`;
    LOOKUP[`${teams[a]}|${teams[b]}`] = { key, homeIsFirst: true };
    LOOKUP[`${teams[b]}|${teams[a]}`] = { key, homeIsFirst: false };
  });
}

function getFirebaseKey(home, away, dynamicLookup) {
  return LOOKUP[`${home}|${away}`]
    || KO_LOOKUP[`${home}|${away}`]
    || (dynamicLookup && dynamicLookup[`${home}|${away}`])
    || null;
}

function getFirebase(firebaseBaseUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(firebaseBaseUrl);
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data) || {}); }
        catch (e) { resolve({}); }
      });
    }).on('error', reject);
  });
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
  // First, fetch current realScores so we can resolve R16/QF/SF/Final pairings dynamically
  const currentScores = await getFirebase(firebaseUrl);
  const dynamicLookup = buildDynamicLookups(currentScores);

  const updates = {};
  let mapped = 0, skipped = 0;

  for (const match of matches) {
    if (match.status !== 'FINISHED') continue;
    const home = match.homeTeam?.name;
    const away = match.awayTeam?.name;
    const s1 = match.score?.fullTime?.home;
    const s2 = match.score?.fullTime?.away;
    if (!home || !away || s1 === null || s1 === undefined) { skipped++; continue; }
    const match_info = getFirebaseKey(home, away, dynamicLookup);
    if (!match_info) { console.log(`No key for: ${home} vs ${away}`); skipped++; continue; }
    const { key, homeIsFirst } = match_info;
    updates[key] = homeIsFirst ? { s1, s2 } : { s1: s2, s2: s1 };
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
