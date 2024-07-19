const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

dotenv.config();

const username = process.env.ADMIN_USERNAME;
const password = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);

const users = [{ username, password }];

exports.findByUsername = (username) => {
  return users.find((user) => user.username === username);
};
