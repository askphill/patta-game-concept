// Klaviyo helpers shared between /api/submit-score and /api/subscribe.

const REVISION = '2024-10-15';

export async function subscribeToKlaviyo(email, { name, score, country } = {}) {
  const apiKey = process.env.KLAVIYO_API_KEY;
  const listId = process.env.KLAVIYO_LIST_ID;
  if (!apiKey || !listId) {
    console.warn('[KLAVIYO] skipped — missing env', { hasApiKey: !!apiKey, hasListId: !!listId });
    return;
  }

  const properties = {};
  if (name) properties.patta_game_username = name;
  if (typeof score === 'number') properties.patta_game_score = score;

  await Promise.all([
    klaviyoSubscribe(apiKey, listId, email),
    klaviyoProfileImport(apiKey, email, country, properties, name),
  ]);
}

async function klaviyoSubscribe(apiKey, listId, email) {
  const res = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'revision': REVISION,
    },
    body: JSON.stringify({
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          profiles: {
            data: [{
              type: 'profile',
              attributes: {
                email,
                subscriptions: {
                  email: { marketing: { consent: 'SUBSCRIBED' } },
                },
              },
            }],
          },
          historical_import: false,
        },
        relationships: {
          list: { data: { type: 'list', id: listId } },
        },
      },
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error('[KLAVIYO] subscription failed', { status: res.status, body });
  } else {
    console.log('[KLAVIYO] subscription ok', { status: res.status, email, listId });
  }
}

async function klaviyoProfileImport(apiKey, email, country, properties, firstName) {
  const attributes = { email };
  if (firstName) attributes.first_name = firstName;
  if (country) attributes.location = { country };
  if (properties && Object.keys(properties).length) attributes.properties = properties;

  const res = await fetch('https://a.klaviyo.com/api/profile-import/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'revision': REVISION,
    },
    body: JSON.stringify({
      data: { type: 'profile', attributes },
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error('[KLAVIYO] profile-import failed', { status: res.status, body });
  } else {
    console.log('[KLAVIYO] profile-import ok', { status: res.status, email, country });
  }
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function resolveCountryName(isoCode) {
  if (!isoCode) return null;
  try {
    return regionNames.of(isoCode) || null;
  } catch {
    return null;
  }
}
