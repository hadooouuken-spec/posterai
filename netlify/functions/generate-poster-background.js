// Netlify Background Function — runs up to 15 minutes in background
// Generates AI poster via Replicate flux-kontext-pro, emails result via Resend

const STYLE_PROMPTS = {
  'Hollywood Blockbuster': 'Transform this photo into an epic Hollywood blockbuster movie poster. Preserve the person\'s face and identity exactly. Add dramatic cinematic lighting with god rays, heroic pose, epic background such as a city skyline or mountain range, photorealistic 8K quality, bold dramatic atmosphere, professional movie poster composition.',
  'Pixar Animation':       'Transform this photo into a Pixar 3D animated movie poster character. Preserve the person\'s likeness rendered in Pixar CGI style. Vibrant warm colors, expressive friendly character design, soft studio lighting, the aesthetic of Toy Story or Coco, high quality Pixar film look.',
  'Anime / Manga':         'Transform this photo into a Japanese anime movie poster. Preserve the person\'s identity rendered in detailed anime illustration style similar to Studio Ghibli or Makoto Shinkai. Vibrant colors, dramatic painted sky background, cinematic anime composition, highly detailed.',
  'Horror / Thriller':     'Transform this photo into a horror movie poster. Preserve the person\'s face. Dark and eerie atmosphere, dramatic horror lighting with deep shadows, fog, desaturated palette with red accents, terrifying cinematic mood, professional horror film poster quality.',
  'Vintage Retro':         'Transform this photo into a vintage 1970s movie poster illustration. Preserve the person\'s likeness in a retro hand-painted style. Warm sepia, orange and red tones, film grain texture, classic Hollywood golden era aesthetic, illustrated poster look.',
  'Sci-Fi Epic':           'Transform this photo into an epic science fiction movie poster hero shot. Preserve the person\'s face. Add futuristic armor or space suit elements, dramatic alien landscape or space background with planets and stars, cinematic blue and purple lighting with lens flares, holographic elements.',
  'Romance Drama':         'Transform this photo into a romantic drama movie poster. Preserve the person\'s likeness. Soft warm golden hour lighting, elegant emotional composition, soft bokeh background of city lights or nature scenery, heartfelt cinematic atmosphere.',
};

async function pollPrediction(predictionId) {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    const data = await res.json();
    if (data.status === 'succeeded') {
      return Array.isArray(data.output) ? data.output[0] : data.output;
    }
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Generation ${data.status}: ${data.error || 'unknown error'}`);
    }
  }
  throw new Error('Generation timed out after 3 minutes');
}

async function generatePoster(photoBase64, style) {
  const prompt = STYLE_PROMPTS[style] || STYLE_PROMPTS['Hollywood Blockbuster'];
  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
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
    }),
  });
  const prediction = await res.json();
  if (prediction.error) throw new Error(prediction.error);
  if (prediction.status === 'succeeded') {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }
  return await pollPrediction(prediction.id);
}

async function sendEmail(toEmail, posterEntries, order) {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const imagesHtml = posterEntries.map(({ style, url }) => `
    <div style="margin-bottom:36px;text-align:center;">
      ${posterEntries.length > 1 ? `<p style="color:#D4AF37;font-weight:600;font-size:14px;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">${style}</p>` : ''}
      <img src="${url}" alt="Your poster" style="width:100%;max-width:360px;border-radius:8px;display:block;margin:0 auto 14px;" />
      <a href="${url}" style="display:inline-block;background:#D4AF37;color:#000;padding:14px 32px;border-radius:50px;font-weight:700;text-decoration:none;font-size:15px;">⬇ Download Poster</a>
    </div>
  `).join('');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `PosterAI <${fromEmail}>`,
      to: toEmail,
      subject: '🎬 Your Movie Poster is Ready!',
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f0ede8;padding:40px 28px;">
          <div style="text-align:center;margin-bottom:36px;">
            <div style="font-size:48px;margin-bottom:16px;">🎬</div>
            <h1 style="color:#D4AF37;font-size:30px;margin:0 0 10px;">Your Poster is Ready!</h1>
            <p style="color:#888;font-size:16px;margin:0;">Here's your personalized movie poster${posterEntries.length > 1 ? 's' : ''}, <strong style="color:#f0ede8;">${order.names}</strong>.</p>
          </div>
          ${imagesHtml}
          <div style="background:#111;border-radius:12px;padding:20px 24px;margin:28px 0;">
            <p style="color:#D4AF37;font-weight:600;font-size:13px;margin:0 0 6px;">🔄 Free Revisions</p>
            <p style="color:#888;font-size:13px;margin:0;">Not quite right? Reply to this email and we'll regenerate it for free — unlimited revisions until you love it.</p>
          </div>
          <hr style="border:none;border-top:1px solid #1e1e1e;margin:28px 0;" />
          <p style="color:#444;font-size:12px;text-align:center;margin:0;">PosterAI — Turn any memory into a movie poster</p>
        </div>
      `,
    }),
  });
}

exports.handler = async (event) => {
  try {
    const { photoBase64, style, names, date, email, product, upsells = [] } = JSON.parse(event.body);
    if (!photoBase64 || !email || !style) {
      return { statusCode: 400, body: 'Missing required fields' };
    }
    const posterEntries = [];
    const primaryUrl = await generatePoster(photoBase64, style);
    posterEntries.push({ style, url: primaryUrl });

    if (product === 'premium') {
      const otherStyles = Object.keys(STYLE_PROMPTS).filter(s => s !== style).slice(0, 2);
      for (const s of otherStyles) {
        const url = await generatePoster(photoBase64, s);
        posterEntries.push({ style: s, url });
      }
    }

    if (upsells.includes('extra-style') && product !== 'premium') {
      const otherStyles = Object.keys(STYLE_PROMPTS).filter(s => s !== style);
      const extraUrl = await generatePoster(photoBase64, otherStyles[0]);
      posterEntries.push({ style: otherStyles[0], url: extraUrl });
    }

    await sendEmail(email, posterEntries, { style, names, date });
    return { statusCode: 200, body: 'Done' };
  } catch (err) {
    console.error('Generation error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
