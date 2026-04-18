// /api/pix.js — wrapper para PIX via Duckfy
// Delega para pay.js com action=pix
const pay = require('./pay');
module.exports = async (req, res) => {
  req.body = { ...(req.body || {}), action: 'pix' };
  req.query = { ...(req.query || {}), action: 'pix' };
  return pay(req, res);
};
