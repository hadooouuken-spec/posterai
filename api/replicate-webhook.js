// Vercel Serverless Function — Replicate Webhook Receiver
// Called by Replicate when a prediction completes.
// Sends the finished poster to the customer via Resend email.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return res.status(500).json({ error: 'Email service not configured.' });
  }

  try {
    // Parse user context from query params
    const { email, names, date, style, product } = req.query;

    // Parse Replicate webhook payload
    const prediction = req.body;

    if (prediction.status !== 'succeeded') {
      console.error('Prediction did not succeed:', prediction.status, prediction.error);h
      return res.status(200).json({ received: true, skipped: true });
    }

    // Replicate returns output as an array of URLs (or a single URL string)
    const output = prediction.output;
    const posterUrl = Array.isArray(output) ? output[0] : output;

    if (!posterUrl) {
      console.error('No output URL in prediction:', prediction);
      return res.status(200).json({ received: true, skipped: true });
    }

    if (!email) {
      console.error('No email in webhook query params');
      return res.status(200).json({ received: true, skipped: true });
    }

    // Send email with the poster URL via Resend
    const productLabel = product === 'premium' ? 'Premium Package' : 'Digital Poster';
    const displayNames = names ? names : 'Your Family';
    const displayDate = date ? date : '';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#ffffff;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:28px;font-weight:700;color:#fff;margin:0 0 8px;">
        🎬 Your Movie Poster is Ready!
      </h1>
      <p style="color:#aaa;font-size:16px;margin:0;">
        ${displayNames}${displayDate ? ' · ' + displayDate : ''} · ${style || 'Hollywood Blockbuster'} Style
      </p>
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <img src="${posterUrl}" alt="Your Movie Poster" style="max-width:100%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);" />
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="${posterUrl}" download style="display:inline-block;background:linear-gradient(135deg,#ff6b35,#f7931e);color:#fff;text-decoration:none;padding:16px 40px;border-radius:50px;font-size:18px;font-weight:700;">
        ⬇️ Download Your Poster
      </a>
    </div>

    <div style="background:#1a1a1a;border-radius:12px;padding:24px;margin-bottom:32px;">
      <h3 style="margin:0 0 12px;font-size:16px;color:#f7931e;">📦 Your ${productLabel} includes:</h3>
      <ul style="margin:0;padding:0 0 0 20px;color:#ccc;line-height:1.8;">
        <li>High-resolution digital poster (JPG)</li>
        <li>Perfect for printing, sharing, or framing</li>
        ${product === 'premium' ? '<li>Multiple style variations</li>' : ''}
      </ul>
    </div>

    <p style="color:#666;font-size:13px;text-align:center;margin:0;">
      Questions? Reply to this email.<br>
      Thank you for choosing PosterAI!
    </p>
  </div>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hfrom: 'PosterAI <posters@leadmagnetai.io>',h
        to: [email],
        subject: `🎬 Your Movie Poster is Ready, ${displayNames}!`,
        html: emailHtml,
      }),
    });

    const emailData = await emailRes.json();

    if (!emailRes.ok) {
      console.error('Resend error:', emailData);
      return res.status(500).json({ error: 'Failed to send email.', resendError: emailData });
    }

    console.log('Email sent successfully to', email, '| Resend ID:', emailData.id);
    return res.status(200).json({ success: true, emailId: emailData.id });
  } catch (err) {
    console.error('replicate-webhook error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
};
