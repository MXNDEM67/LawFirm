const express = require("express");
const pool = require("../database");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.delete("/:id", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const [result] = await pool.execute(
            "DELETE FROM messages WHERE id = ?",
            [request.params.id]
        );
        if (result.affectedRows === 0) {
            return response.status(404).json({ message: "Message not found." });
        }
        response.json({ message: "Message deleted." });
    } catch (error) {
        next(error);
    }
});

router.get("/", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const [messages] = await pool.execute(
            `SELECT id, name, email, phone, service, message, created_at
             FROM messages
             ORDER BY created_at DESC`
        );
        response.json(messages);
    } catch (error) {
        next(error);
    }
});

router.post("/", async (request, response, next) => {
    try {
        const { name, email, phone, service, message } = request.body;
        const values = [name, email, phone, service, message].map((value) =>
            typeof value === "string" ? value.trim() : ""
        );
        const [cleanName, cleanEmail, cleanPhone, cleanService, cleanMessage] = values;

        if (!cleanName || cleanName.length > 120 || cleanEmail.length > 190
            || !emailPattern.test(cleanEmail) || !cleanPhone || cleanPhone.length > 40
            || !cleanService || cleanService.length > 120
            || !cleanMessage || cleanMessage.length > 10000) {
            return response.status(400).json({
                message: "Enter a name (up to 120 characters), valid email (up to 190 characters), phone (up to 40 characters), service (up to 120 characters), and message (up to 10,000 characters)."
            });
        }

        await pool.execute(
            `INSERT INTO messages (name, email, phone, service, message)
             VALUES (?, ?, ?, ?, ?)`,
            [cleanName, cleanEmail, cleanPhone, cleanService, cleanMessage]
        );

        response.status(201).json({ message: "Your message has been received." });
    } catch (error) {
        next(error);
    }
});

module.exports = router;