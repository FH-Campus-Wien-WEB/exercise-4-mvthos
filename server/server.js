/*
 * server.js — Movie management server with user authentication.
 *
 * Responsibilities:
 *   - Serve the static client files.
 *   - Authenticate users (POST /login, GET /logout, GET /session).
 *   - Manage a per-user movie collection (GET/PUT/POST/DELETE /movies).
 *   - Proxy the OMDb API for search and full-movie lookups.
 *
 * All movie endpoints are protected by the requireLogin middleware.
 */

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

/*
 * express-session is the middleware that gives us server-side sessions.
 * It creates a session object on req.session and manages the signed
 * session-id cookie automatically (see the app.use(session(...)) below).
 */
const session = require('express-session');

/*
 * bcryptjs is a pure-JavaScript implementation of the bcrypt password
 * hashing algorithm. We never store plain passwords — users.json holds
 * bcrypt hashes — so we use bcrypt.compare() to verify a login.
 */
const bcrypt = require('bcryptjs');

/*
 * config.js reads the .env file (via dotenv) and exposes the port,
 * the OMDb API key, the session secret and the OMDb timeout. Keeping
 * these out of the code is the whole point of the .env file.
 */
const config = require('./config.js');

/* The per-user, file-backed movie model (movie-model.js / movies.json). */
const movieModel = require('./movie-model.js');

/* Read-only user lookup backed by users.json. */
const userModel = require('./user-model.js');

const app = express();

app.use(bodyParser.json());

/*
 * Configure express-session.
 *
 *   secret             signs the session-id cookie so the client cannot
 *                      tamper with it (loaded from .env).
 *   resave: false      do not write the session back to the store when
 *                      nothing changed.
 *   saveUninitialized  false → anonymous visitors do NOT get a session
 *                      until they actually log in.
 *   cookie.httpOnly    the cookie is not readable from JavaScript,
 *                      which mitigates XSS-based session theft.
 *
 * The session data itself lives on the server (in memory here); the
 * browser only ever holds the session id.
 */
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true },
}));

app.use(express.static(path.join(__dirname, 'files')));

/*
 * requireLogin — gate middleware for protected endpoints.
 *
 * Calls next() to continue the request chain when a user session
 * exists, otherwise ends the request with 401 Unauthorized.
 */
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.sendStatus(401);
  }
}

/* Strip the password hash before sending a user to the client. */
function publicUser(user, loginTime) {
  return {
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    loginTime,
  };
}

/*
 * POST /login — authenticate a user and create a session.
 *
 * Body: { username, password }. The stored password is a bcrypt hash,
 * so we compare with bcrypt.compare(). On success the user (without the
 * hash) is stored in the session and returned to the client.
 */
app.post('/login', function (req, res) {
  const { username, password } = req.body || {};
  const user = userModel.getUser(username);

  if (!user || typeof password !== 'string') {
    return res.sendStatus(401);
  }

  bcrypt.compare(password, user.password, function (err, match) {
    if (err || !match) {
      return res.sendStatus(401);
    }
    const loginTime = new Date().toISOString();
    req.session.user = publicUser(user, loginTime);
    res.json(req.session.user);
  });
});

/*
 * GET /session — report the current session status. Returns the user
 * object when logged in, otherwise 401 so the client can show the
 * login dialog.
 */
app.get('/session', function (req, res) {
  if (req.session && req.session.user) {
    res.json(req.session.user);
  } else {
    res.sendStatus(401);
  }
});

/*
 * GET /logout — destroy the session. Responds 200 on success, 500 if
 * the session store fails to remove the session.
 */
app.get('/logout', function (req, res) {
  req.session.destroy(function (err) {
    if (err) {
      res.sendStatus(500);
    } else {
      res.clearCookie('connect.sid');
      res.sendStatus(200);
    }
  });
});

/*
 * GET /movies — the logged-in user's collection as a JSON array.
 * Optional ?genre=<name> keeps only movies in that genre.
 */
app.get('/movies', requireLogin, function (req, res) {
  const genre = req.query.genre;
  const all = movieModel.getMovies(req.session.user.username);
  res.json(genre ? all.filter(m => m.Genres.includes(genre)) : all);
});

/*
 * GET /movies/:imdbID — a single movie from the user's collection,
 * used by the edit form. 404 when the user does not own that movie.
 */
app.get('/movies/:imdbID', requireLogin, function (req, res) {
  const movie = movieModel.getMovie(req.session.user.username, req.params.imdbID);
  if (movie) {
    res.json(movie);
  } else {
    res.sendStatus(404);
  }
});

/*
 * PUT /movies/:imdbID — update an existing movie or add the one in the
 * request body. 200 when it already existed, 201 when newly created.
 */
app.put('/movies/:imdbID', requireLogin, function (req, res) {
  const username = req.session.user.username;
  const imdbID = req.params.imdbID;
  const existed = movieModel.getMovie(username, imdbID) !== undefined;
  const movie = { ...req.body, imdbID };

  movieModel.setMovie(username, movie);

  if (existed) {
    res.sendStatus(200);
  } else {
    res.status(201).json(movie);
  }
});

/*
 * POST /movies/:imdbID — add a movie by imdbID.
 *
 * Fetches the full record from OMDb, converts it into our internal
 * format and stores it for the current user. Uses the same
 * promise-based fetch pattern as GET /search.
 */
app.post('/movies/:imdbID', requireLogin, function (req, res) {
  const username = req.session.user.username;
  const imdbID = req.params.imdbID;

  omdb({ i: imdbID, plot: 'short' })
    .then(data => {
      if (!data || data.Response === 'False') {
        return res.status(404).json({ error: (data && data.Error) || 'Movie not found' });
      }
      const movie = convertOmdbMovie(data);
      movieModel.setMovie(username, movie);
      res.status(201).json(movie);
    })
    .catch(() => res.status(502).json({ error: 'OMDb request failed' }));
});

/*
 * DELETE /movies/:imdbID — remove a movie from the user's collection.
 * 204 on success, 404 when the user does not own that movie.
 */
app.delete('/movies/:imdbID', requireLogin, function (req, res) {
  const removed = movieModel.deleteMovie(req.session.user.username, req.params.imdbID);
  res.sendStatus(removed ? 204 : 404);
});

/*
 * GET /genres — distinct genres in the user's collection, sorted.
 */
app.get('/genres', requireLogin, function (req, res) {
  res.json(movieModel.getGenres(req.session.user.username));
});

/*
 * GET /search — search OMDb by title. Query: ?query=<text>.
 * Returns the OMDb "Search" array (Title, Year, imdbID, Poster, ...)
 * or an empty array when nothing matches.
 */
app.get('/search', requireLogin, function (req, res) {
  const query = req.query.query;
  if (!query) {
    return res.json([]);
  }

  omdb({ s: query })
    .then(data => {
      res.json(data && data.Response === 'True' ? data.Search : []);
    })
    .catch(() => res.status(502).json({ error: 'OMDb request failed' }));
});

/*
 * omdb(params) — one promise-based OMDb API call.
 *
 * OMDb is reached over HTTPS with the API key as a query parameter.
 * We use the Fetch API (global in Node 18+, the same promise-based
 * API the client uses) so both GET /search and POST /movies/:imdbID
 * share exactly one request helper.
 *
 *   - URLSearchParams.set() escapes every parameter safely.
 *   - AbortSignal.timeout(ms) aborts the request after the configured
 *     timeout so a slow OMDb cannot hang our server forever; the
 *     rejected promise is handled by the .catch() of each caller.
 *   - response.json() parses the OMDb JSON body into an object.
 */
function omdb(params) {
  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', config.omdbApiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return fetch(url, { signal: AbortSignal.timeout(config.omdbTimeoutMs) })
    .then(response => response.json());
}

/*
 * OMDb returns every field as a string and in a display-oriented shape
 * (e.g. Released "25 Jun 1982", Runtime "109 min", Genre as a single
 * comma-separated string). The helpers below reformat that raw data
 * into our internal model — the exact conversion specified in Exercise
 * 1 (rename to plural, ISO dates, numbers instead of strings, arrays
 * instead of comma-separated strings).
 */

/* Maps OMDb's English month abbreviations to their two-digit numbers. */
const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/*
 * "25 Jun 1982" -> "1982-06-25" (ISO 8601). Anything that does not
 * match the expected three-part shape is passed through unchanged so
 * we never crash on an unexpected OMDb value.
 */
function toIsoDate(released) {
  const parts = String(released).split(' ');
  if (parts.length === 3 && MONTHS[parts[1]]) {
    const day = parts[0].padStart(2, '0');
    return `${parts[2]}-${MONTHS[parts[1]]}-${day}`;
  }
  return released;
}

/*
 * "Horror, Mystery, Sci-Fi" -> ["Horror","Mystery","Sci-Fi"].
 * OMDb uses the literal string "N/A" for missing data, which we turn
 * into an empty array. split/trim/filter removes stray whitespace and
 * empty entries.
 */
function toList(value) {
  if (!value || value === 'N/A') {
    return [];
  }
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

/*
 * "109 min" / "57" -> 109 / 57 (a real Number). The regex strips any
 * non-numeric characters (like the " min" unit). "N/A" or anything
 * that is not a finite number becomes null.
 */
function toNumber(value) {
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && String(value) !== 'N/A' ? n : null;
}

/*
 * convertOmdbMovie — OMDb full record -> internal movie format.
 * Renames Genre/Director/Writer to plural arrays, converts dates and
 * numbers, and keeps only the fields the client needs.
 */
function convertOmdbMovie(data) {
  return {
    imdbID: data.imdbID,
    Title: data.Title,
    Released: toIsoDate(data.Released),
    Runtime: toNumber(data.Runtime),
    Genres: toList(data.Genre),
    Directors: toList(data.Director),
    Writers: toList(data.Writer),
    Actors: toList(data.Actors),
    Plot: data.Plot,
    Poster: data.Poster,
    Metascore: toNumber(data.Metascore),
    imdbRating: toNumber(data.imdbRating),
  };
}

app.listen(config.port);
console.log(`Server now listening on http://localhost:${config.port}/`);
