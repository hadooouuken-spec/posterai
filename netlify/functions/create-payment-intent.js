// Uses Node built-in fetch — no npm dependencies needed

const PRODUCTS = {
  digital: 2499,  // $24.99
  premium: 4999,  // $49.99
};

const UPSELLS = {
  'extra-style': 1000,  // +$10
  'rush':        1500,  // +$15
  'wallpaper':    500,  // +$5
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Stripe secret key not configured.' }),
    };
  }

  try {
    const { product, upsells = [], email, names, date, style } = JSON.parse(event.body);

    if (!product || !PRODUCTS[product]) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid product.' }) };
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
    params.append('description', `PosterAI — ${product} (${style || ''}) for ${names || ''}`);
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
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: data.error?.message || 'Stripe error.' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ clientSecret: data.client_secret }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
