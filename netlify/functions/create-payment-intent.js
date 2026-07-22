const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  digital: 2499,
  poster:  4999,
  framed:  7999,
  canvas:  9900,
  mug:     3499,
  bundle:  12900,
};

const UPSELLS = {
  'extra-style': 1000,
  'rush':        1500,
  'animated':    2000,
  'wallpaper':    500,
  'reveal':      1500,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
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

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      receipt_email: email || undefined,
      metadata: { product, style: style || '', names: names || '', date: date || '', upsells: validUpsells.join(',') },
      description: `PosterAI — ${product} (${style}) for ${names}`,
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
