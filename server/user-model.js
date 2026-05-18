/*
 * User data model (read-only)
 *
 * Users are loaded once from users.json. There is no user management
 * yet, so this module only exposes a lookup by username. Passwords are
 * stored as bcrypt hashes; verification happens in server.js.
 */

const fs = require('fs');
const path = require('path');

const usersFile = path.join(__dirname, 'users.json');
const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));

/* Return the user object for a username, or undefined if unknown. */
function getUser(username) {
  return users[username];
}

module.exports = { getUser };
