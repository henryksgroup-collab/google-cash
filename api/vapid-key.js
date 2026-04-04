/* Retorna a VAPID public key para o cliente registrar push subscriptions */
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const publicKey = process.env.VAPID_PUBLIC_KEY || null;

  if (!publicKey) {
    return res.status(200).json({ publicKey: null });
  }

  // Sanitize: remove any accidental whitespace/newlines from env var
  return res.status(200).json({ publicKey: publicKey.trim() });
};
