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

exports.loginRequired = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  } else {
    res.redirect("/auth/login");
  }
};
