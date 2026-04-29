const ALLOWED_ORIGINS = [
  'https://patta-game.vercel.app',
  'https://patta-game-concept.vercel.app',
  'https://project-nwbtz.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

// Allow this project's Vercel preview deployments + any localhost port for dev
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/patta-game-[a-z0-9-]+-askphilldevelopment\.vercel\.app$/.test(origin)) return true;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

export function validateOrigin(req, res) {
  const origin = req.headers['origin'] || req.headers['referer'];
  if (!origin) {
    res.status(403).json({ error: 'Submission failed. Please try again.' });
    return false;
  }
  // Extract origin from referer (referer includes the full URL)
  const originHost = origin.startsWith('http') ? new URL(origin).origin : null;
  if (!isAllowedOrigin(origin) && !isAllowedOrigin(originHost)) {
    res.status(403).json({ error: 'Submission failed. Please try again.' });
    return false;
  }
  return true;
}
