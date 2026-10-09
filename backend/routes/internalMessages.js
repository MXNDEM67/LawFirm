const express = require("express");
const pool = require("../database");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
const maximumMessageLength = 5000;

function getOtherRole(role) {
    if (role === "admin") return "lawyer";
    if (role === "lawyer") return "admin";
    return null;
}

async function getContact(role, contactId) {
    const otherRole = getOtherRole(role);
    if (!otherRole || !Number.isSafeInteger(contactId) || contactId < 1) {
        return null;
    }

    const [contacts] = await pool.execute(
        `SELECT id, name, email, role
         FROM users
         WHERE id = ? AND role = ?
         LIMIT 1`,
        [contactId, otherRole]
    );
    return contacts[0] || null;
}

router.use(authenticate, authorize("admin", "lawyer"));

router.get("/contacts", async (request, response, next) => {
    const otherRole = getOtherRole(request.user.role);
    if (!otherRole) {
        return response.status(403).json({ message: "Only admins and lawyers can use internal messaging." });
    }

    try {
        const [contacts] = await pool.execute(
            `SELECT u.id, u.name, u.email,
                    (
                        SELECT im.message
                        FROM internal_messages im
                        WHERE (im.sender_id = u.id AND im.recipient_id = ?)
                           OR (im.sender_id = ? AND im.recipient_id = u.id)
                        ORDER BY im.id DESC
                        LIMIT 1
                    ) AS last_message,
                    (
                        SELECT im.created_at
                        FROM internal_messages im
                        WHERE (im.sender_id = u.id AND im.recipient_id = ?)
                           OR (im.sender_id = ? AND im.recipient_id = u.id)
                        ORDER BY im.id DESC
                        LIMIT 1
                    ) AS last_message_at,
                    (
                        SELECT COUNT(*)
                        FROM internal_messages im
                        WHERE im.sender_id = u.id
                          AND im.recipient_id = ?
                          AND im.read_at IS NULL
                    ) AS unread_count
             FROM users u
             WHERE u.role = ?
             ORDER BY COALESCE(last_message_at, u.created_at) DESC, u.name ASC`,
            [
                request.user.id,
                request.user.id,
                request.user.id,
                request.user.id,
                request.user.id,
                otherRole
            ]
        );
        response.json(contacts);
    } catch (error) {
        next(error);
    }
});

router.get("/:userId", async (request, response, next) => {
    const contactId = Number(request.params.userId);

    try {
        const contact = await getContact(request.user.role, contactId);
        if (!contact) {
            return response.status(404).json({ message: "Admin or lawyer contact not found." });
        }

        const [messages] = await pool.execute(
            `SELECT id, sender_id, recipient_id, message, created_at
             FROM (
                 SELECT id, sender_id, recipient_id, message, created_at
                 FROM internal_messages
                 WHERE (sender_id = ? AND recipient_id = ?)
                    OR (sender_id = ? AND recipient_id = ?)
                 ORDER BY id DESC
                 LIMIT 200
             ) recent_messages
             ORDER BY id ASC`,
            [request.user.id, contactId, contactId, request.user.id]
        );
        response.json(messages);
    } catch (error) {
        next(error);
    }
});

router.post("/:userId/read", async (request, response, next) => {
    const contactId = Number(request.params.userId);

    try {
        const contact = await getContact(request.user.role, contactId);
        if (!contact) {
            return response.status(404).json({ message: "Admin or lawyer contact not found." });
        }

        await pool.execute(
            `UPDATE internal_messages
             SET read_at = CURRENT_TIMESTAMP
             WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL`,
            [contactId, request.user.id]
        );
        response.status(204).end();
    } catch (error) {
        next(error);
    }
});

router.post("/:userId", async (request, response, next) => {
    const contactId = Number(request.params.userId);
    const message = typeof request.body.message === "string"
        ? request.body.message.trim()
        : "";

    if (!message || message.length > maximumMessageLength) {
        return response.status(400).json({
            message: `Enter a message between 1 and ${maximumMessageLength} characters.`
        });
    }

    try {
        const contact = await getContact(request.user.role, contactId);
        if (!contact) {
            return response.status(404).json({ message: "Admin or lawyer contact not found." });
        }

        const [result] = await pool.execute(
            `INSERT INTO internal_messages (sender_id, recipient_id, message)
             VALUES (?, ?, ?)`,
            [request.user.id, contactId, message]
        );
        response.status(201).json({
            id: result.insertId,
            sender_id: request.user.id,
            recipient_id: contactId,
            message,
            created_at: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
