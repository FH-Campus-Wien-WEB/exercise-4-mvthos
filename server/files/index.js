/*
 * index.js — overview page: authentication, movie listing, search.
 *
 * All AJAX uses the Fetch API. Cookies (the session id) are sent
 * automatically because every request is same-origin.
 *
 *   currentSession  the logged-in user (or null when logged out)
 *   updateUI()      reflects the session state in the page
 *   loadMovies()    fetches and renders the user's collection
 *   searchMovies()  queries OMDb and renders the results in the dialog
 *   addMovie()      adds a search result to the collection
 */

let currentSession = null;

document.addEventListener("DOMContentLoaded", function () {
  const loginDialog = document.querySelector("#loginDialog");
  const searchDialog = document.querySelector("#searchDialog");

  document.querySelector("#loginButton").onclick = function () {
    document.querySelector("#loginError").hidden = true;
    loginDialog.showModal();
  };
  document.querySelector("#loginCancel").onclick = function () {
    loginDialog.close();
  };
  document.querySelector("#searchButton").onclick = function () {
    document.querySelector("#searchResults").innerHTML = "";
    document.querySelector("#searchForm").reset();
    searchDialog.showModal();
  };
  document.querySelector("#searchCancel").onclick = function () {
    searchDialog.close();
  };
  document.querySelector("#logoutButton").onclick = logout;

  document.querySelector("#loginForm").addEventListener("submit", function (event) {
    event.preventDefault();
    login();
  });

  document.querySelector("#searchForm").addEventListener("submit", function (event) {
    event.preventDefault();
    searchMovies(document.querySelector("#query").value.trim());
  });

  /* Restore an existing session (e.g. after a page reload). */
  fetch("/session")
    .then(response => (response.ok ? response.json() : null))
    .then(user => {
      currentSession = user;
      updateUI();
      if (currentSession) {
        loadMovies();
      }
    });
});

/*
 * Task 1.1 — POST /login with the form credentials. On success store
 * the response in currentSession, close the dialog, refresh the UI and
 * load the user's movies. On failure show an error in the dialog.
 */
function login() {
  const username = document.querySelector("#username").value;
  const password = document.querySelector("#password").value;
  const errorEl = document.querySelector("#loginError");

  fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
    .then(response => {
      if (!response.ok) {
        throw new Error("invalid credentials");
      }
      return response.json();
    })
    .then(user => {
      currentSession = user;
      document.querySelector("#loginDialog").close();
      document.querySelector("#loginForm").reset();
      updateUI();
      loadMovies();
    })
    .catch(() => {
      errorEl.textContent = "Login fehlgeschlagen. Bitte Benutzername und Passwort prüfen.";
      errorEl.hidden = false;
    });
}

/* GET /logout, then reset the UI back to the logged-out state. */
function logout() {
  fetch("/logout").then(() => {
    currentSession = null;
    updateUI();
  });
}

/*
 * Reflect the session state: toggle the header buttons, render the
 * greeting and the genre navigation. When logged out, clear the page.
 */
function updateUI() {
  const loggedIn = Boolean(currentSession);

  document.querySelector("#loginButton").hidden = loggedIn;
  document.querySelector("#searchButton").hidden = !loggedIn;
  document.querySelector("#logoutButton").hidden = !loggedIn;

  renderUserGreeting();

  if (loggedIn) {
    loadGenres();
  } else {
    document.querySelector("#genre-nav").innerHTML = "";
    document.querySelector("#movies-container").innerHTML = "";
  }
}

/*
 * Task 1.2 — render the greeting into #userGreeting, e.g.
 * "Hi Joe Doe, du hast dich am 19. April 2026 um 21:15 angemeldet."
 */
function renderUserGreeting() {
  const el = document.querySelector("#userGreeting");
  if (!currentSession) {
    el.textContent = "";
    return;
  }

  const when = new Date(currentSession.loginTime);
  const date = when.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = when.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  el.textContent =
    `Hi ${currentSession.firstName} ${currentSession.lastName}, ` +
    `du hast dich am ${date} um ${time} angemeldet.`;
}

/*
 * Fetch /genres and build the genre navigation. A leading "All"
 * button clears the filter. Clicking the first button triggers the
 * initial render.
 */
function loadGenres() {
  fetch("/genres")
    .then(response => (response.ok ? response.json() : []))
    .then(genres => {
      const nav = document.querySelector("#genre-nav");
      nav.innerHTML = "";

      const allBtn = document.createElement("button");
      allBtn.textContent = "All";
      allBtn.onclick = function () { loadMovies(); };
      nav.appendChild(allBtn);

      for (const genre of genres) {
        const btn = document.createElement("button");
        btn.textContent = genre;
        btn.onclick = function () { loadMovies(genre); };
        nav.appendChild(btn);
      }
    });
}

/*
 * Fetch the user's movies (optionally filtered by genre) and render
 * one card per movie into #movies-container.
 */
function loadMovies(genre) {
  const container = document.querySelector("#movies-container");
  container.innerHTML = "";

  const url = new URL("/movies", location.origin);
  if (genre) {
    url.searchParams.set("genre", genre);
  }

  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error("status " + response.status);
      }
      return response.json();
    })
    .then(movies => {
      for (const movie of movies) {
        container.appendChild(buildMovieCard(movie));
      }
    })
    .catch(error => {
      container.append("Daten konnten nicht geladen werden: " + error.message);
    });
}

/* Build a single movie <article> card. */
function buildMovieCard(movie) {
  const article = document.createElement("article");
  article.id = movie.imdbID;

  const img = document.createElement("img");
  img.src = movie.Poster;
  img.alt = movie.Title + " poster";
  img.onerror = function () { img.style.display = "none"; };
  article.appendChild(img);

  const info = document.createElement("div");
  info.className = "movie-info";

  const title = document.createElement("h2");
  title.textContent = movie.Title;
  info.appendChild(title);

  info.appendChild(metaLine("Released:", " " + movie.Released));
  info.appendChild(metaLine("Runtime:", " " + movie.Runtime + " min"));

  const genresP = document.createElement("p");
  genresP.appendChild(metaLabel("Genres:"));
  genresP.append(" ");
  for (const g of movie.Genres) {
    const span = document.createElement("span");
    span.className = "genre";
    span.textContent = g;
    genresP.appendChild(span);
  }
  info.appendChild(genresP);

  info.appendChild(metaLine("Directors:", " " + movie.Directors.join(", ")));
  info.appendChild(metaLine("Writers:", " " + movie.Writers.join(", ")));
  info.appendChild(metaLine("Actors:", " " + movie.Actors.join(", ")));
  info.appendChild(metaLine("Plot:", " " + movie.Plot));

  const ratingsP = document.createElement("p");
  ratingsP.appendChild(metaLabel("IMDb:"));
  ratingsP.append(" ");
  ratingsP.appendChild(ratingSpan(movie.imdbRating));
  ratingsP.append("   ");
  ratingsP.appendChild(metaLabel("Metascore:"));
  ratingsP.append(" ");
  ratingsP.appendChild(ratingSpan(movie.Metascore));
  info.appendChild(ratingsP);

  const editButton = document.createElement("button");
  editButton.textContent = "Edit";
  editButton.onclick = function () {
    location.href = "edit.html?imdbID=" + movie.imdbID;
  };
  info.appendChild(editButton);

  const deleteButton = document.createElement("button");
  deleteButton.textContent = "Delete";
  deleteButton.onclick = function () { deleteMovie(movie.imdbID); };
  info.appendChild(deleteButton);

  article.appendChild(info);
  return article;
}

function metaLabel(text) {
  const span = document.createElement("span");
  span.className = "meta-label";
  span.textContent = text;
  return span;
}

function metaLine(label, value) {
  const p = document.createElement("p");
  p.appendChild(metaLabel(label));
  p.append(value);
  return p;
}

function ratingSpan(value) {
  const span = document.createElement("span");
  span.className = "rating";
  span.textContent = value;
  return span;
}

/* DELETE a movie, then refresh the list. */
function deleteMovie(imdbID) {
  fetch("/movies/" + imdbID, { method: "DELETE" }).then(response => {
    if (response.ok) {
      loadGenres();
      loadMovies();
    }
  });
}

/*
 * Task 2.2 — search OMDb and render the results in the dialog. Each
 * result shows Title and Year plus an Add button calling addMovie().
 * Shows a message when nothing is found.
 */
function searchMovies(query) {
  const results = document.querySelector("#searchResults");
  results.innerHTML = "";

  if (!query) {
    return;
  }

  const url = new URL("/search", location.origin);
  url.searchParams.set("query", query);

  fetch(url)
    .then(response => (response.ok ? response.json() : []))
    .then(movies => {
      if (!movies || movies.length === 0) {
        results.textContent = "Keine Filme gefunden.";
        return;
      }

      for (const movie of movies) {
        const entry = document.createElement("div");
        entry.className = "search-result";
        entry.id = "result-" + movie.imdbID;

        const text = document.createElement("span");
        text.textContent = movie.Title + " (" + movie.Year + ")";
        entry.appendChild(text);

        const addButton = document.createElement("button");
        addButton.textContent = "Add";
        addButton.onclick = function () { addMovie(movie.imdbID); };
        entry.appendChild(addButton);

        results.appendChild(entry);
      }
    })
    .catch(() => {
      results.textContent = "Suche fehlgeschlagen.";
    });
}

/*
 * Task 2.3 (client side) — add a movie by imdbID. On success remove
 * its entry from the dialog and refresh the collection.
 */
function addMovie(imdbID) {
  fetch("/movies/" + imdbID, { method: "POST" }).then(response => {
    if (response.ok) {
      const entry = document.querySelector("#result-" + imdbID);
      if (entry) {
        entry.remove();
      }
      loadGenres();
      loadMovies();
    } else {
      alert("Film konnte nicht hinzugefügt werden.");
    }
  });
}
