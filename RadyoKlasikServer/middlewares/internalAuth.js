// Guards the internal Liquidsoap <-> API playout endpoints. These are called
// by Liquidsoap (a server, not a user) over the private compose network, so
// they use a shared internal secret header instead of a user JWT.
exports.internalOnly = (req, res, next) => {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) {
    return res
      .status(500)
      .json({ error: "INTERNAL_API_SECRET is not configured" });
  }
  const provided = req.headers["x-internal-secret"];
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Invalid internal secret" });
  }
  next();
};
