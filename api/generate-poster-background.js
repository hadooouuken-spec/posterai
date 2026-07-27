// Vercel Serverless Function
// Starts a Replicate prediction and returns 202 immediately.
// Replicate will POST the result to /api/replicate-webhook when done.

const STYLE_PROMPTS = {
  'Hollywood Blockbuster': 'Transform this photo into an epic Hollywood Blockbuster movie poster. Preserve the person\'s face and identity exactly. Add dramatic cinematic lighting with god rays, heroic pose, epic background such as a city skyline or mountain range, photorealistic 8k quality, bold dramatic atmosphere, cinematic composition.',
  'Pixar Animation':       'Transform this photo into a Pixar 3D animated movie poster character. Preserve the person\'s likeness rendered in Pixar CGI style. Vibrant warm colors, expressive friendly character design, soft studio lighting, the aesthetic of Toy Story or Coco, high quality Pixar film look.',
  'Anime / Manga':         'Transform this photo into a Japanese anime movie poster. Preserve the person\'s identity rendered in detailed anime illustration style similar to Studio Ghibli or Makoto Shinkai. Vibrant colors, dramatic painted sky background, cinematic anime composition, highly detailed.',
  'Horror / Thriller':     'Transform this photo into a horror movie poster. Preserve the person\'s face. Dark and eerie atmosphere, dramatic horror lighting with deep shadows, fog, desaturated palette with red accents, terrifying cinematic mood, professional horror film poster quality.',
  'Vintage Retro':         'Transform this photo into a vintage 1970s movie poster illustration. Preserve the person\'s likeness in a retro hand-painted style. Warm sepia, orange and red tones, film grain texture, classic Hollywood golden era aesthetic, illustrated poster look.',
  'Sci-Fi Epic':           'Transform this photo into an epic science fiction movie poster hero shot. Preserve the person\'s face. Add futuristic armor or space suit elements, dramatic alien landscape or space background with planets and stars, cinematic blue and purple lighting with lens flares, holographic elements.',
  'Romance Drama':         'Transform this photo into a romantic drama movie poster. Preserve the person\'s likeness. Soft warm golden hour lighting, elegant emotional composition, soft bokeh background of city lights or nature scenery, heartfelt cinematic atmosphere.',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_API_TOKEN) {
    return res.status(500).json({ error: 'Replicate API token not configured.' });
  }

  try {
    const { photoBase64, style, email, names, date, product } = req.body;

    if (!photoBase64 || !email) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const prompt = STYLE_PROMPTS[style] || STYLE_PROMPTS['Hollywood Blockbuster'];

    // Build webhook URL with user context as query params
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'getposterai.com';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const webhookParams = new URLSearchParams({
      email: email || '',
      names: names || '',
      date: date || '',
      style: style || '',
      product: product || 'digital',
    });
    const webhookUrl = `${proto}://${host}/api/replicate-webhook?${webhookParams.toString()}`;

    // Start the Replicate prediction
    const replicateRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'respond-async',
      },
      body: JSON.stringify({
        input: {
          prompt,
          input_image: `data:image/jpeg;base64,${photoBase64}`,
          aspect_ratio: '2:3',
          output_format: 'jpg',
          output_quality: 95,
          safety_tolerance: 2,
        },
        webhook: webhookUrl,
        webhook_events_filter: ['completed'],
      }),
    });

    const data = await replicateRes.json();

    if (!replicateRes.ok) {
      console.error('Replicate error:', data);
      return res.status(500).json({ error: data.detail || 'Failed to start poster generation.' });
    }

    // Return 202 immediately — the webhook will email the result when done
    return res.status(202).json({
      status: 'processing',
      predictionId: data.id,
      message: 'Your poster is being generated. Check your email in a few minutes!',
    });
  } catch (err) {
    console.error('generate-poster-background error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
};
