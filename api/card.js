// /api/card.js — wrapper para cartao via TriboPay
// Delega para pay.js com action=card
const pay = require('./pay');
module.exports = async (req, res) => {
  req.body = { ...(req.body || {}), action: 'card' };
  req.query = { ...(req.query || {}), action: 'card' };
  return pay(req, res);
};
