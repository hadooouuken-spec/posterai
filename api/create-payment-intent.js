// Uses Node built-in fetch — no npm dependencies needed

const PRODUCTS = {
  digital: 2499, // $24.99
  premium: 4999, // $49.99
};

const UPSELLS = {
  'extra-style': 1000, // +$10
  'rush':        1500, // +$15
  'wallpaper':    500, // +$5
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe secret key not configured.' });
  }

  try {
    const { product, upsells = [], email, names, date, style } = req.body;

    if (!product || !PRODUCTS[product]) {
      return res.status(400).json({ error: 'Invalid product.' });
    }

    let amount = PRODUCTS[product];
    const validUpsells = [];
    for (const id of upsells) {
      if (UPSELLS[id]) { amount += UPSELLS[id]; validUpsells.push(id); }
    }

    const params = new URLSearchParams();
    params.append('amount', String(amount));
    params.append('currency', 'usd');
    params.append('automatic_payment_methods[enabled]', 'true');
    if (email) params.append('receipt_email', email);
    params.append('description', `PosterAI - ${product} ${style || ''} for ${names || ''}`);
    params.append('metadata[product]', product);
    params.append('metadata[style]', style || '');
    params.append('metadata[names]', names || '');
    params.append('metadata[date]', date || '');
    params.append('metadata[upsells]', validUpsells.join(','));

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();

    if (!stripeRes.ok) {
      return res.status(400).json({ error: data.error?.message || 'Stripe error.' });
    }

    return res.status(200).json({ clientSecret: data.client_secret });
  } catch (err) {
    console.error('Payment intent error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
};
