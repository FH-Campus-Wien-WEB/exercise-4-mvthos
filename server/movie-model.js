/*
 * Movie data model (per-user, file-backed)
 *
 * Movies are persisted in movies.json. The top level is keyed by
 * username; each user maps to an object keyed by imdbID, e.g.
 *
 *   { "joe": { "tt0084787": { ...movie... } }, "jane": { ... } }
 *
 * Keying by imdbID gives O(1) lookup, while Object.values() converts
 * a user's collection to an array for the GET /movies endpoint.
 *
 * Every mutating function writes the whole structure back to disk so
 * the data survives a server restart.
 */

const fs = require('fs');
const path = require('path');

const moviesFile = path.join(__dirname, 'movies.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(moviesFile, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(moviesFile, JSON.stringify(data, null, 2) + '\n');
}

function collectionOf(data, username) {
  if (!data[username]) {
    data[username] = {};
  }
  return data[username];
}

/* Return all movies of a user as an array (empty array if none). */
function getMovies(username) {
  const data = load();
  return Object.values(data[username] || {});
}

/* Return a single movie of a user, or undefined if not found. */
function getMovie(username, imdbID) {
  const data = load();
  return (data[username] || {})[imdbID];
}

/* Add or update a movie for a user. Returns the stored movie. */
function setMovie(username, movie) {
  const data = load();
  collectionOf(data, username)[movie.imdbID] = movie;
  save(data);
  return movie;
}

/* Delete a movie for a user. Returns true if something was removed. */
function deleteMovie(username, imdbID) {
  const data = load();
  const collection = data[username];
  if (collection && collection[imdbID]) {
    delete collection[imdbID];
    save(data);
    return true;
  }
  return false;
}

/* Distinct genres across a user's movies, sorted alphabetically. */
function getGenres(username) {
  const genres = new Set();
  getMovies(username).forEach(movie => {
    (movie.Genres || []).forEach(genre => genres.add(genre));
  });
  return [...genres].sort();
}

module.exports = {
  getMovies,
  getMovie,
  setMovie,
  deleteMovie,
  getGenres,
};
