const mysql = require("mysql2/promise");

const requiredDatabaseSettings = ["DB_HOST", "DB_USER", "DB_NAME"];
const missingSettings = requiredDatabaseSettings.filter(
    (setting) => !process.env[setting]
);

if (missingSettings.length > 0) {
    throw new Error(
        `Missing required database environment variables: ${missingSettings.join(", ")}`
    );
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;