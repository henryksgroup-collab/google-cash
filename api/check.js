// /api/check.js — wrapper para verificar status PIX via Duckfy
// Delega para pay.js com action=check
const pay = require('./pay');
module.exports = async (req, res) => {
  req.query = { ...(req.query || {}), action: 'check' };
  return pay(req, res);
};
