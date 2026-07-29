/* ============================================================
   THE CARD CATALOG — Library Management System
   Pure JavaScript. No frameworks, no libraries.
   ============================================================ */

/* ---------- Constants ---------- */
const STORAGE_KEY = "libraryCatalogBooks";

/* ---------- DOM References ---------- */
const bookForm        = document.getElementById("bookForm");
const bookIdField      = document.getElementById("bookId");
const titleInput       = document.getElementById("title");
const authorInput      = document.getElementById("author");
const categoryInput    = document.getElementById("category");
const yearInput        = document.getElementById("year");
const isbnInput        = document.getElementById("isbn");
const statusSelect     = document.getElementById("status");
const borrowerFields       = document.getElementById("borrowerFields");
const borrowerNameInput    = document.getElementById("borrowerName");
const borrowerContactInput = document.getElementById("borrowerContact");

const submitBtn        = document.getElementById("submitBtn");
const cancelEditBtn     = document.getElementById("cancelEditBtn");
const formTitle         = document.getElementById("formTitle");

const cardGrid          = document.getElementById("cardGrid");
const emptyState        = document.getElementById("emptyState");
const noResultsState    = document.getElementById("noResultsState");

const searchInput       = document.getElementById("searchInput");
const categoryFilter     = document.getElementById("categoryFilter");
const sortSelect         = document.getElementById("sortSelect");

const statTotal          = document.getElementById("statTotal");
const statAvailable      = document.getElementById("statAvailable");
const statIssued         = document.getElementById("statIssued");

const confirmOverlay     = document.getElementById("confirmOverlay");
const confirmMessage     = document.getElementById("confirmMessage");
const confirmDeleteBtn   = document.getElementById("confirmDelete");
const confirmCancelBtn   = document.getElementById("confirmCancel");

const toastStack         = document.getElementById("toastStack");

/* ---------- Application State ---------- */
// The in-memory array of book objects. This mirrors what is saved in Local Storage.
let libraryBooks = [];

// Tracks the ISBN awaiting deletion while the confirmation dialog is open.
let pendingDeleteIsbn = null;

/* ============================================================
   LOCAL STORAGE HELPERS
   ============================================================ */

function loadBooksFromStorage() {
  const rawData = localStorage.getItem(STORAGE_KEY);
  if (!rawData) {
    return [];
  }
  try {
    const parsedBooks = JSON.parse(rawData);
    return Array.isArray(parsedBooks) ? parsedBooks : [];
  } catch (error) {
    console.error("Could not parse saved library data:", error);
    return [];
  }
}

function saveBooksToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(libraryBooks));
  } catch (error) {
    console.error("Local Storage save failed:", error);
    showToast(
      "Could not save to Local Storage. Your browser may be blocking it on this page.",
      "error"
    );
  }
}

/* ============================================================
   BORROWER FIELDS VISIBILITY
   ============================================================ */

// Shows the "Issued To" name/contact fields only when the status is "Issued".
function refreshBorrowerFieldsVisibility() {
  const isIssued = statusSelect.value === "Issued";
  borrowerFields.hidden = !isIssued;
  if (!isIssued) {
    borrowerNameInput.value = "";
    borrowerContactInput.value = "";
    document.getElementById("err-borrowerName").textContent = "";
    document.getElementById("err-borrowerContact").textContent = "";
    borrowerNameInput.classList.remove("invalid");
    borrowerContactInput.classList.remove("invalid");
  }
}

/* ============================================================
   VALIDATION
   ============================================================ */

// Clears every inline error message and "invalid" input highlight.
function clearValidationErrors() {
  const errorFieldIds = ["title", "author", "category", "year", "isbn", "borrowerName", "borrowerContact"];
  errorFieldIds.forEach(function (fieldId) {
    const errorLabel = document.getElementById("err-" + fieldId);
    const inputField = document.getElementById(fieldId);
    if (errorLabel) errorLabel.textContent = "";
    if (inputField) inputField.classList.remove("invalid");
  });
}

function showFieldError(fieldId, message) {
  const errorLabel = document.getElementById("err-" + fieldId);
  const inputField = document.getElementById(fieldId);
  if (errorLabel) errorLabel.textContent = message;
  if (inputField) inputField.classList.add("invalid");
}

// Validates the form and returns a clean data object, or null if invalid.
function validateBookForm() {
  clearValidationErrors();

  const title = titleInput.value.trim();
  const author = authorInput.value.trim();
  const category = categoryInput.value.trim();
  const yearText = yearInput.value.trim();
  const isbn = isbnInput.value.trim();

  let isValid = true;

  if (title === "") {
    showFieldError("title", "Book title is required.");
    isValid = false;
  }

  if (author === "") {
    showFieldError("author", "Author name is required.");
    isValid = false;
  }

  if (category === "") {
    showFieldError("category", "Category is required.");
    isValid = false;
  }

  const currentYear = new Date().getFullYear();
  const yearNumber = Number(yearText);
  if (yearText === "" || !Number.isInteger(yearNumber)) {
    showFieldError("year", "Enter a valid year.");
    isValid = false;
  } else if (yearNumber < 1000 || yearNumber > currentYear) {
    showFieldError("year", "Year must be between 1000 and " + currentYear + ".");
    isValid = false;
  }

  if (isbn === "") {
    showFieldError("isbn", "ISBN or Book ID is required.");
    isValid = false;
  } else {
    // Prevent duplicate ISBNs, unless we are editing that exact same record.
    const editingId = bookIdField.value;
    const duplicateBook = libraryBooks.find(function (book) {
      return book.isbn.toLowerCase() === isbn.toLowerCase() && book.isbn !== editingId;
    });
    if (duplicateBook) {
      showFieldError("isbn", "A book with this ISBN already exists.");
      isValid = false;
    }
  }

  const status = statusSelect.value;
  let borrowerName = "";
  let borrowerContact = "";

  if (status === "Issued") {
    borrowerName = borrowerNameInput.value.trim();
    borrowerContact = borrowerContactInput.value.trim();

    if (borrowerName === "") {
      showFieldError("borrowerName", "Enter who this book is issued to.");
      isValid = false;
    }

    const contactPattern = /^[0-9+\-\s()]{7,}$/;
    if (borrowerContact === "") {
      showFieldError("borrowerContact", "Enter a contact number.");
      isValid = false;
    } else if (!contactPattern.test(borrowerContact)) {
      showFieldError("borrowerContact", "Enter a valid contact number.");
      isValid = false;
    }
  }

  if (!isValid) {
    return null;
  }

  return {
    title: title,
    author: author,
    category: category,
    year: yearNumber,
    isbn: isbn,
    status: status,
    borrowerName: borrowerName,
    borrowerContact: borrowerContact
  };
}

/* ============================================================
   CRUD OPERATIONS
   ============================================================ */

// CREATE: adds a brand new book to the catalog.
function addBook(bookData) {
  libraryBooks.push(bookData);
  saveBooksToStorage();
}

// UPDATE: finds a book by its original ISBN and replaces its fields.
function updateBook(originalIsbn, updatedData) {
  const bookIndex = libraryBooks.findIndex(function (book) {
    return book.isbn === originalIsbn;
  });
  if (bookIndex !== -1) {
    libraryBooks[bookIndex] = updatedData;
    saveBooksToStorage();
  }
}

// DELETE: removes a book permanently using its ISBN as the unique key.
function deleteBook(isbn) {
  libraryBooks = libraryBooks.filter(function (book) {
    return book.isbn !== isbn;
  });
  saveBooksToStorage();
}

/* ============================================================
   RENDERING
   ============================================================ */

// Escapes text before inserting it into HTML to avoid markup injection.
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function buildStatusBadge(status) {
  const badgeClass = status === "Available" ? "status-available" : "status-issued";
  return '<span class="status-badge ' + badgeClass + '">' + escapeHtml(status) + "</span>";
}

function createBookCardElement(book) {
  const card = document.createElement("article");
  card.className = "book-card";
  card.dataset.isbn = book.isbn;

  card.innerHTML =
    '<h3 class="book-card-title">' + escapeHtml(book.title) + "</h3>" +
    '<p class="book-card-author">by ' + escapeHtml(book.author) + "</p>" +
    '<div class="book-card-meta">' +
      "<span><b>Category:</b> " + escapeHtml(book.category) + "</span>" +
      "<span><b>ISBN / ID:</b> " + escapeHtml(book.isbn) + "</span>" +
      "<span><b>Published:</b> " + escapeHtml(String(book.year)) + "</span>" +
    "</div>" +
    buildStatusBadge(book.status) +
    (book.status === "Issued"
      ? '<p class="borrower-note"><b>Issued to:</b> ' + escapeHtml(book.borrowerName) +
        '<br><b>Contact:</b> ' + escapeHtml(book.borrowerContact) + "</p>"
      : "") +
    '<div class="book-card-actions">' +
      '<button class="btn btn-ghost edit-btn" type="button">Edit</button>' +
      '<button class="btn btn-danger delete-btn" type="button">Delete</button>' +
    "</div>";

  card.querySelector(".edit-btn").addEventListener("click", function () {
    beginEditBook(book.isbn);
  });
  card.querySelector(".delete-btn").addEventListener("click", function () {
    openDeleteConfirmation(book.isbn);
  });

  return card;
}

// Applies the current search text, category filter, and sort order.
function getFilteredAndSortedBooks() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedCategory = categoryFilter.value;
  const sortMode = sortSelect.value;

  let visibleBooks = libraryBooks.filter(function (book) {
    const matchesSearch =
      book.title.toLowerCase().indexOf(searchTerm) !== -1 ||
      book.author.toLowerCase().indexOf(searchTerm) !== -1;
    const matchesCategory = selectedCategory === "" || book.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  visibleBooks.sort(function (a, b) {
    switch (sortMode) {
      case "title-desc":
        return b.title.localeCompare(a.title);
      case "year-desc":
        return b.year - a.year;
      case "year-asc":
        return a.year - b.year;
      case "title-asc":
      default:
        return a.title.localeCompare(b.title);
    }
  });

  return visibleBooks;
}

function renderCategoryFilterOptions() {
  const previousSelection = categoryFilter.value;

  // Collect every unique category currently in the catalog.
  const uniqueCategories = [];
  libraryBooks.forEach(function (book) {
    if (uniqueCategories.indexOf(book.category) === -1) {
      uniqueCategories.push(book.category);
    }
  });
  uniqueCategories.sort(function (a, b) {
    return a.localeCompare(b);
  });

  categoryFilter.innerHTML = '<option value="">All Categories</option>';
  uniqueCategories.forEach(function (category) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });

  // Restore the previous selection if that category still exists.
  if (uniqueCategories.indexOf(previousSelection) !== -1) {
    categoryFilter.value = previousSelection;
  }
}

function renderStats() {
  const totalCount = libraryBooks.length;
  const availableCount = libraryBooks.filter(function (book) {
    return book.status === "Available";
  }).length;
  const issuedCount = totalCount - availableCount;

  statTotal.textContent = totalCount;
  statAvailable.textContent = availableCount;
  statIssued.textContent = issuedCount;
}

function renderBookGrid() {
  cardGrid.innerHTML = "";

  const hasAnyBooks = libraryBooks.length > 0;
  const visibleBooks = getFilteredAndSortedBooks();

  emptyState.hidden = hasAnyBooks;
  noResultsState.hidden = !hasAnyBooks || visibleBooks.length > 0;

  visibleBooks.forEach(function (book) {
    cardGrid.appendChild(createBookCardElement(book));
  });
}

function renderAll() {
  renderCategoryFilterOptions();
  renderBookGrid();
  renderStats();
}

/* ============================================================
   FORM WORKFLOW (Add / Edit)
   ============================================================ */

function resetForm() {
  bookForm.reset();
  bookIdField.value = "";
  clearValidationErrors();
  refreshBorrowerFieldsVisibility();
  formTitle.textContent = "New Accession Slip";
  submitBtn.textContent = "Stamp & File Book";
  cancelEditBtn.hidden = true;
}

function beginEditBook(isbn) {
  const book = libraryBooks.find(function (b) {
    return b.isbn === isbn;
  });
  if (!book) return;

  bookIdField.value = book.isbn;
  titleInput.value = book.title;
  authorInput.value = book.author;
  categoryInput.value = book.category;
  yearInput.value = book.year;
  isbnInput.value = book.isbn;
  statusSelect.value = book.status;
  refreshBorrowerFieldsVisibility();
  borrowerNameInput.value = book.borrowerName || "";
  borrowerContactInput.value = book.borrowerContact || "";

  formTitle.textContent = "Editing Catalog Card";
  submitBtn.textContent = "Update Book";
  cancelEditBtn.hidden = false;

  clearValidationErrors();
  titleInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleFormSubmit(event) {
  event.preventDefault();

  const bookData = validateBookForm();
  if (!bookData) {
    showToast("Please fix the highlighted fields.", "error");
    return;
  }

  const editingIsbn = bookIdField.value;

  if (editingIsbn) {
    updateBook(editingIsbn, bookData);
    showToast('"' + bookData.title + '" was updated.', "success");
  } else {
    addBook(bookData);
    showToast('"' + bookData.title + '" was added to the catalog.', "success");
  }

  resetForm();
  renderAll();
}

/* ============================================================
   DELETE CONFIRMATION DIALOG
   ============================================================ */

function openDeleteConfirmation(isbn) {
  const book = libraryBooks.find(function (b) {
    return b.isbn === isbn;
  });
  if (!book) return;

  pendingDeleteIsbn = isbn;
  confirmMessage.textContent =
    'This will permanently remove "' + book.title + '" from the catalog.';
  confirmOverlay.hidden = false;
  confirmDeleteBtn.focus();
}

function closeDeleteConfirmation() {
  pendingDeleteIsbn = null;
  confirmOverlay.hidden = true;
}

function handleConfirmedDelete() {
  if (!pendingDeleteIsbn) return;

  const book = libraryBooks.find(function (b) {
    return b.isbn === pendingDeleteIsbn;
  });

  deleteBook(pendingDeleteIsbn);

  // If the book being deleted was mid-edit, reset the form too.
  if (bookIdField.value === pendingDeleteIsbn) {
    resetForm();
  }

  closeDeleteConfirmation();
  renderAll();

  if (book) {
    showToast('"' + book.title + '" was withdrawn from the catalog.', "success");
  }
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = "toast" + (type === "error" ? " error" : "");
  toast.textContent = message;
  toastStack.appendChild(toast);

  setTimeout(function () {
    toast.remove();
  }, 3200);
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */

bookForm.addEventListener("submit", handleFormSubmit);
cancelEditBtn.addEventListener("click", resetForm);
statusSelect.addEventListener("change", refreshBorrowerFieldsVisibility);

searchInput.addEventListener("input", renderBookGrid);
categoryFilter.addEventListener("change", renderBookGrid);
sortSelect.addEventListener("change", renderBookGrid);

confirmDeleteBtn.addEventListener("click", handleConfirmedDelete);
confirmCancelBtn.addEventListener("click", closeDeleteConfirmation);
confirmOverlay.addEventListener("click", function (event) {
  if (event.target === confirmOverlay) {
    closeDeleteConfirmation();
  }
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !confirmOverlay.hidden) {
    closeDeleteConfirmation();
  }
});

/* ============================================================
   INITIALIZATION
   ============================================================ */

function isLocalStorageAvailable() {
  try {
    const testKey = "__storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
}

function initializeApp() {
  if (!isLocalStorageAvailable()) {
    showToast(
      "Local Storage is blocked in this browser context — books won't be saved after refresh. Try opening this file through a local server instead of double-clicking it.",
      "error"
    );
  }
  libraryBooks = loadBooksFromStorage();
  renderAll();
}

initializeApp();