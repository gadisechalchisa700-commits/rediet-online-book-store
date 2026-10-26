const cors = require("cors");
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(cors());
// Test the server
app.get("/api", (req, res) => {
  res.json({
    message: "Welcome to Rediet Online Book Store API!",
    status: "Server is working"
  });
});

// Test the MySQL connection
app.get("/api/db-test", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DATABASE() AS databaseName"
    );

    res.json({
      message: "MySQL connected successfully!",
      database: rows[0].databaseName
    });
  } catch (error) {
    console.error("Database error:", error.message);

    res.status(500).json({
      message: "Database connection failed."
    });
  }
});

// Connect to MySQL
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10
});

// Get all books
app.get("/api/books", async (req, res) => {
  try {
    const [books] = await db.query(
      "SELECT * FROM books ORDER BY id"
    );

    res.json(books);
  } catch (error) {
    console.error("Books error:", error.message);

    res.status(500).json({
      message: "Could not retrieve books."
    });
  }
});

app.post("/api/books", async (req, res) => {
  const { title, author, price, category, description } = req.body;

  // Check required fields
  if (
    typeof title !== "string" || !title.trim() ||
    typeof author !== "string" || !author.trim() ||
    typeof category !== "string" || !category.trim() ||
    price === undefined || price === null ||
    price === "" || !Number.isFinite(Number(price)) ||
    Number(price) < 0
  ) {
    return res.status(400).json({
      message: "Please provide a title, author, valid price, and category."
    });
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO books (title, author, price, category, description)
       VALUES (?, ?, ?, ?, ?)`,
      [
        title.trim(),
        author.trim(),
        Number(price),
        category.trim(),
        typeof description === "string" ? description.trim() : null
      ]
    );

    res.status(201).json({
      message: "Book saved successfully!",
      bookId: result.insertId,
      title: title.trim()
    });
  } catch (error) {
    console.error("Save book error:", error.message);

    res.status(500).json({
      message: "Could not save the book."
    });
  }
});


app.post("/api/orders", async (req, res) => {
  const { customer, items } = req.body;

  // 1. Validate customer information
  if (
    !customer ||
    typeof customer.name !== "string" ||
    !customer.name.trim() ||
    typeof customer.phone !== "string" ||
    !customer.phone.trim() ||
    typeof customer.address !== "string" ||
    !customer.address.trim()
  ) {
    return res.status(400).json({
      message: "Please provide the customer's name, phone, and address."
    });
  }

  // 2. Validate the books and quantities
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.some(item =>
      !Number.isSafeInteger(Number(item.id)) ||
      Number(item.id) < 1 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100
    )
  ) {
    return res.status(400).json({
      message: "Please provide valid book IDs and quantities."
    });
  }

  let connection;

  try {
    // 3. Start a database transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    const orderNumber = `RED-${Date.now()}`;

    // 4. Create the order
    const [orderResult] = await connection.execute(
      `INSERT INTO orders
       (order_number, customer_name, customer_phone,
        customer_address, total)
       VALUES (?, ?, ?, ?, ?)`,
      [
        orderNumber,
        customer.name.trim(),
        customer.phone.trim(),
        customer.address.trim(),
        0
      ]
    );

    let total = 0;

    // 5. Save each book in the order
    for (const item of items) {
      const [foundBooks] = await connection.execute(
        "SELECT id, price FROM books WHERE id = ?",
        [Number(item.id)]
      );

      if (foundBooks.length === 0) {
        await connection.rollback();

        return res.status(400).json({
          message: `Book ID ${item.id} does not exist.`
        });
      }

      // Use the price stored in MySQL
      const price = Number(foundBooks[0].price);
      total += price * item.quantity;

      await connection.execute(
        `INSERT INTO order_items
         (order_id, book_id, quantity, price)
         VALUES (?, ?, ?, ?)`,
        [
          orderResult.insertId,
          Number(item.id),
          item.quantity,
          price
        ]
      );
    }

    // 6. Update the final order total
    await connection.execute(
      "UPDATE orders SET total = ? WHERE id = ?",
      [total, orderResult.insertId]
    );

    // 7. Save all changes
    await connection.commit();

    res.status(201).json({
      message: "Order saved successfully!",
      orderNumber,
      total,
      itemCount: items.reduce(
        (sum, item) => sum + item.quantity,
        0
      )
    });

  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error("Save order error:", error.message);

    res.status(500).json({
      message: "Could not save the order."
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
});


app.get("/api/orders", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        o.id AS orderId,
        o.order_number AS orderNumber,
        o.customer_name AS customerName,
        o.customer_phone AS customerPhone,
        o.customer_address AS customerAddress,
        o.total AS total,
        o.created_at AS createdAt,
        oi.book_id AS bookId,
        b.title AS bookTitle,
        oi.quantity AS quantity,
        oi.price AS itemPrice
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN books b ON oi.book_id = b.id
      ORDER BY o.id DESC, oi.id ASC
    `);

    const ordersById = new Map();

    for (const row of rows) {
      if (!ordersById.has(row.orderId)) {
        ordersById.set(row.orderId, {
          orderNumber: row.orderNumber,
          date: row.createdAt,
          customer: {
            name: row.customerName,
            phone: row.customerPhone,
            address: row.customerAddress
          },
          items: [],
          total: Number(row.total)
        });
      }

      if (row.bookId !== null) {
        ordersById.get(row.orderId).items.push({
          id: row.bookId,
          title: row.bookTitle,
          price: Number(row.itemPrice),
          quantity: row.quantity
        });
      }
    }

    res.json(Array.from(ordersById.values()));
  } catch (error) {
  console.error("Get orders error:", error);
  res.status(500).json({
    message: "Could not retrieve orders.",
    detail: error.message
  });
}
});

// Start the server
app.listen(PORT, () => {
  console.log(`Rediet backend running at http://localhost:${PORT}`);
});


