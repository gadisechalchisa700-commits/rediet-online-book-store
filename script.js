"use strict";

// Rediet Online Book Store — front-end demo.
// Orders are saved only in this browser; no payment or real delivery is processed.

let books = [];

const $ = (selector) => document.querySelector(selector);
const bookList = $("#book-list");
const searchInput = $("#search-input");
const categoryFilter = $("#category-filter");
const resultsMessage = $("#results-message");
const cartItemsElement = $("#cart-items");
const cartTotalElement = $("#cart-total");
const cartCountElement = $("#cart-count");
const cartHeadingCount = $("#cart-heading-count");
const checkoutForm = $("#checkout-form");
const orderMessage = $("#order-message");
const confirmationMessage = $("#confirmation-message");
const orderHistoryElement = $("#order-history");

let cart = loadArray("redietCart");
let orders = loadArray("redietOrders");
let nextOrderNumber = Number(localStorage.getItem("redietNextOrderNumber")) || 1;
let pendingOrder = null;

function loadArray(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveData() {
  try {
    localStorage.setItem("redietCart", JSON.stringify(cart));
    localStorage.setItem("redietOrders", JSON.stringify(orders));
    localStorage.setItem("redietNextOrderNumber", String(nextOrderNumber));
  } catch (error) {
    console.warn("Browser storage is unavailable. Data may not persist.", error);
  }
}

function formatPrice(amount) {
  return `${Number(amount).toLocaleString("en-US")} ETB`;
}
async function loadBooks() {
  try {
    resultsMessage.textContent = "Loading books...";

    const response = await fetch("http://localhost:3000/api/books");

    if (!response.ok) {
      throw new Error("Could not load books from the server.");
    }

    books = await response.json();

    displayBooks();
  } catch (error) {
    console.error("Loading books failed:", error);

    resultsMessage.textContent =
      "Could not load books. Please check the backend server.";
  }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function displayBooks() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedCategory = categoryFilter.value;

  const filteredBooks = books.filter((book) => {
    const matchesSearch = `${book.title} ${book.author}`.toLowerCase().includes(searchTerm);
    const matchesCategory = selectedCategory === "all" || book.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  resultsMessage.textContent = `${filteredBooks.length} book${filteredBooks.length === 1 ? "" : "s"} found`;

  if (filteredBooks.length === 0) {
    bookList.innerHTML = '<div class="empty-state">No books match your search. Try another title or category.</div>';
    return;
  }

  bookList.innerHTML = filteredBooks.map((book) => `
    <article class="book-card">
      <div class="book-cover" aria-hidden="true">
        <div class="cover-inner">
          <span class="cover-label">${escapeHTML(book.category.toUpperCase())}</span>
          <strong>${escapeHTML(book.title)}</strong>
          <small>REDIET BOOKS</small>
        </div>
      </div>
      <div class="book-info">
        <span class="category-pill">${escapeHTML(book.category)}</span>
        <h3>${escapeHTML(book.title)}</h3>
        <p class="book-author">by ${escapeHTML(book.author)}</p>
        <p class="muted">${escapeHTML(book.description)}</p>
        <div class="book-bottom">
          <span class="price">${formatPrice(book.price)}</span>
          <button class="button button-primary add-button" type="button" data-add="${book.id}">Add to cart +</button>
        </div>
      </div>
    </article>
  `).join("");
}

function addToCart(bookId) {
  const selectedBook = books.find((book) => book.id === Number(bookId));
  if (!selectedBook) return;

  const existingBook = cart.find((item) => item.id === selectedBook.id);
  if (existingBook) {
    existingBook.quantity += 1;
  } else {
    cart.push({ ...selectedBook, quantity: 1 });
  }

  pendingOrder = null;
  confirmationMessage.textContent = "";
  $("#order-message").textContent = "";
  saveData();
  displayCart();
}

function changeQuantity(bookId, amount) {
  const item = cart.find((book) => book.id === Number(bookId));
  if (!item) return;

  item.quantity += amount;
  if (item.quantity <= 0) {
    cart = cart.filter((book) => book.id !== Number(bookId));
  }

  pendingOrder = null;
  confirmationMessage.textContent = "";
  saveData();
  displayCart();
}

function removeFromCart(bookId) {
  cart = cart.filter((book) => book.id !== Number(bookId));
  pendingOrder = null;
  confirmationMessage.textContent = "";
  saveData();
  displayCart();
}

function displayCart() {
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  cartCountElement.textContent = totalQuantity;
  cartHeadingCount.textContent = `${totalQuantity} item${totalQuantity === 1 ? "" : "s"}`;
  cartTotalElement.textContent = formatPrice(totalPrice);

  if (cart.length === 0) {
    cartItemsElement.innerHTML = '<p class="cart-empty">Your cart is empty. Add a book from the bookshelf above.</p>';
    return;
  }

  cartItemsElement.innerHTML = cart.map((item) => `
    <div class="cart-row">
      <div>
        <p class="cart-book-title">${escapeHTML(item.title)}</p>
        <p class="cart-book-meta">${formatPrice(item.price)} each</p>
      </div>
      <div class="quantity-controls" aria-label="Quantity for ${escapeHTML(item.title)}">
        <button class="quantity-button" type="button" data-minus="${item.id}" aria-label="Decrease quantity">−</button>
        <span class="quantity-number">${item.quantity}</span>
        <button class="quantity-button" type="button" data-plus="${item.id}" aria-label="Increase quantity">+</button>
      </div>
      <div class="cart-line-end">
        <span class="cart-line-total">${formatPrice(item.price * item.quantity)}</span>
        <button class="remove-button" type="button" data-remove="${item.id}">Remove</button>
      </div>
    </div>
  `).join("");
}

function validateCheckout() {
  if (cart.length === 0) return "Your cart is empty. Please add at least one book.";
  const name = $("#customer-name").value.trim();
  const phone = $("#customer-phone").value.trim();
  const address = $("#customer-address").value.trim();

  if (!name || !phone || !address) return "Please complete your name, phone number, and delivery address.";
  if (phone.replace(/[^\d]/g, "").length < 7) return "Please enter a valid phone number.";
  return "";
}

function buildPendingOrder() {
  const customer = {
    name: $("#customer-name").value.trim(),
    phone: $("#customer-phone").value.trim(),
    address: $("#customer-address").value.trim()
  };
  const items = cart.map((item) => ({
    id: item.id, title: item.title, price: item.price, quantity: item.quantity
  }));
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  pendingOrder = { customer, items, total };
  confirmationMessage.innerHTML = `
    <div class="review-box">
      <h4>Please review your order</h4>
      <p><strong>Name:</strong> ${escapeHTML(customer.name)}</p>
      <p><strong>Phone:</strong> ${escapeHTML(customer.phone)}</p>
      <p><strong>Address:</strong> ${escapeHTML(customer.address)}</p>
      <p><strong>Books:</strong> ${items.map((item) => `${escapeHTML(item.title)} × ${item.quantity}`).join(", ")}</p>
      <p><strong>Total:</strong> ${formatPrice(total)}</p>
      <button class="button button-primary button-full confirm-order-final" id="place-demo-order-button" type="button">Confirm demo order</button>
    </div>
  `;
  orderMessage.textContent = "Check your details and order summary below.";
}

function confirmDemoOrder() {
  if (!pendingOrder || cart.length === 0) {
    confirmationMessage.textContent = "Your cart changed. Please review your order again.";
    return;
  }

  const orderNumber = `RED-${String(nextOrderNumber).padStart(4, "0")}`;
  const order = {
    orderNumber,
    date: new Date().toLocaleString(),
    customer: pendingOrder.customer,
    items: pendingOrder.items,
    total: pendingOrder.total
  };

  orders.unshift(order);
  nextOrderNumber += 1;
  cart = [];
  pendingOrder = null;
  saveData();
  displayCart();
  displayOrderHistory();
  checkoutForm.reset();
  orderMessage.textContent = "";
  confirmationMessage.innerHTML = `
    <div class="review-box">
      <h4>Demo order confirmed! ✓</h4>
      <p>Your demo order number is <strong>${escapeHTML(orderNumber)}</strong>.</p>
      <p>No payment was taken and no real order was sent.</p>
    </div>
  `;
}

function displayOrderHistory() {
  if (orders.length === 0) {
    orderHistoryElement.innerHTML = '<div class="history-empty">No orders yet. Your confirmed demo orders will appear here.</div>';
    return;
  }

  orderHistoryElement.innerHTML = orders.map((order) => `
    <article class="order-card">
      <div class="order-card-header">
        <h3>Order <span class="order-number">${escapeHTML(order.orderNumber)}</span></h3>
        <strong>${formatPrice(order.total)}</strong>
      </div>
      <p><strong>Date:</strong> ${escapeHTML(order.date)}</p>
      <p><strong>Customer:</strong> ${escapeHTML(order.customer.name)}</p>
      <p><strong>Phone:</strong> ${escapeHTML(order.customer.phone)}</p>
      <p><strong>Address:</strong> ${escapeHTML(order.customer.address)}</p>
      <ul>${order.items.map((item) => `<li>${escapeHTML(item.title)} × ${item.quantity} — ${formatPrice(item.price * item.quantity)}</li>`).join("")}</ul>
    </article>
  `).join("");
}

async function loadOrders() {
  try {
    const response = await fetch("http://localhost:3000/api/orders");

    if (!response.ok) {
      throw new Error("Could not load order history from the database.");
    }

    const savedOrders = await response.json();

    orders = savedOrders.map((order) => ({
      ...order,
      date: order.date
        ? new Date(order.date).toLocaleString()
        : "Date unavailable",
      total: Number(order.total),
      items: order.items.map((item) => ({
        ...item,
        price: Number(item.price),
        quantity: Number(item.quantity)
      }))
    }));

    displayOrderHistory();
  } catch (error) {
    console.error("Load orders failed:", error);
    orderHistoryElement.innerHTML =
      '<div class="history-empty">Could not load order history. Please make sure the backend is running.</div>';
  }
}

bookList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button) addToCart(button.dataset.add);
});

cartItemsElement.addEventListener("click", (event) => {
  const plusButton = event.target.closest("[data-plus]");
  const minusButton = event.target.closest("[data-minus]");
  const removeButton = event.target.closest("[data-remove]");

  if (plusButton) changeQuantity(plusButton.dataset.plus, 1);
  if (minusButton) changeQuantity(minusButton.dataset.minus, -1);
  if (removeButton) removeFromCart(removeButton.dataset.remove);
});

searchInput.addEventListener("input", displayBooks);
categoryFilter.addEventListener("change", displayBooks);

$("#welcome-button").addEventListener("click", () => {
  $("#message").textContent = "Happy reading! Choose a book below to get started.";
  $("#books").scrollIntoView({ behavior: "smooth" });
});

$("#back-to-books-button").addEventListener("click", () => {
  $("#books").scrollIntoView({ behavior: "smooth" });
});

$("#clear-cart-button").addEventListener("click", () => {
  cart = [];
  pendingOrder = null;
  confirmationMessage.textContent = "";
  orderMessage.textContent = "";
  saveData();
  displayCart();
});

checkoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const error = validateCheckout();
  if (error) {
    orderMessage.textContent = error;
    confirmationMessage.textContent = "";
    return;
  }
  buildPendingOrder();
});

confirmationMessage.addEventListener("click", (event) => {
  if (event.target.closest("#place-demo-order-button")) confirmDemoOrder();
});

// If customer details change after reviewing, require another review.
["customer-name", "customer-phone", "customer-address"].forEach((id) => {
  $(`#${id}`).addEventListener("input", () => {
    if (pendingOrder) {
      pendingOrder = null;
      confirmationMessage.textContent = "";
      orderMessage.textContent = "Your details changed. Submit the form again to review the updated order.";
    }
  });
});

const addBookForm = document.querySelector("#add-book-form");
const addBookMessage = document.querySelector("#add-book-message");

addBookForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const book = {
    title: $("#new-book-title").value.trim(),
    author: $("#new-book-author").value.trim(),
    price: $("#new-book-price").value,
    category: $("#new-book-category").value,
    description: $("#new-book-description").value.trim()
  };

  if (
    !book.title ||
    !book.author ||
    book.price === "" ||
    !Number.isFinite(Number(book.price)) ||
    Number(book.price) < 0 ||
    !book.category
  ) {
    addBookMessage.textContent =
      "Please enter a valid title, author, price, and category.";
    return;
  }

  const submitButton = addBookForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Saving book...";
  addBookMessage.textContent = "";

  try {
    const response = await fetch("http://localhost:3000/api/books", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(book)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not save the book.");
    }

    addBookForm.reset();
    await loadBooks();

    addBookMessage.textContent =
      `Success! "${result.title}" was saved to the database.`;
  } catch (error) {
    console.error("Add book failed:", error);
    addBookMessage.textContent =
      error.message || "Could not save the book. Check your backend.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save book";
  }
});

loadBooks();
displayCart();
loadOrders();
