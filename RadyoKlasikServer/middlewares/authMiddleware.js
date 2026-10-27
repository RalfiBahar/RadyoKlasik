const jwt = require("jsonwebtoken");

exports.tokenRequired = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!token) {
    return res.status(401).json({ message: "Token is missing!" });
  }

  try {
    jwt.verify(token, process.env.SECRET_KEY);
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res
        .status(401)
        .json({ error: "token_expired", message: "Token has expired!" });
    } else {
      return res.status(401).json({ message: "Invalid token!" });
    }
  }
};

// Legacy admin actions (recordings, announcements, push notifications). The
// shared-secret token is embedded in the public listener apps, so it must NOT
// be enough here: require the EJS dashboard's admin session or a staff admin
// token (Phase 7 studio login).
exports.adminRequired = async (req, res, next) => {
  if (req.session && req.session.user) return next();
  try {
    const { verifyStaffToken, tokenFromRequest } = require("../services/staffAuth");
    req.user = await verifyStaffToken(tokenFromRequest(req), ["admin"]);
    return next();
  } catch (err) {
    return res.status(err.status || 401).json({ message: "Admin access required" });
  }
};

exports.loginRequired = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  } else {
    res.redirect("/auth/login");
  }
};
