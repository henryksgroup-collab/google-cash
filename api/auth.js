/* Admin authentication */
const PASS = process.env.ADMIN_PASSWORD || 'gcadmin2026';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false, error: 'Senha obrigatória' });

  if (password !== PASS) {
    return res.status(401).json({ ok: false, error: 'Senha incorreta' });
  }

  return res.status(200).json({ ok: true, token: PASS });
};
