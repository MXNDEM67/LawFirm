const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../database");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}

async function validateUserLink(userId) {
    if (userId === null || userId === undefined || userId === "") {
        return null;
    }
    if (!Number.isInteger(Number(userId)) || Number(userId) < 1) {
        return false;
    }
    const [users] = await pool.execute(
        "SELECT id FROM users WHERE id = ? AND role = 'lawyer' LIMIT 1",
        [Number(userId)]
    );
    return users.length ? Number(userId) : false;
}

router.get("/admin", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const [lawyers] = await pool.execute(
            `SELECT l.id, l.user_id, l.name, l.title,
                    l.practice_areas AS practiceAreas, l.bio, l.email, l.phone,
                    l.is_active AS isActive, u.email AS accountEmail
             FROM lawyers l
             LEFT JOIN users u ON u.id = l.user_id
             ORDER BY l.is_active DESC, l.name`
        );
        response.json(lawyers);
    } catch (error) {
        next(error);
    }
});

router.post("/admin", authenticate, authorize("admin"), async (request, response, next) => {
    let connection;
    let transactionStarted = false;
    try {
        const name = cleanText(request.body.name);
        const title = cleanText(request.body.title);
        const practiceAreas = cleanText(request.body.practiceAreas);
        const bio = cleanText(request.body.bio);
        const email = cleanText(request.body.email).toLowerCase();
        const phone = cleanText(request.body.phone) || null;
        const requestedUserId = request.body.userId;

        if (!name || name.length > 120 || !title || title.length > 120
            || !practiceAreas || practiceAreas.length > 255
            || (email && (email.length > 190 || !emailPattern.test(email)))
            || (phone && phone.length > 40)) {
            return response.status(400).json({ message: "Name, title, and practice areas are required and must fit the listed fields." });
        }
        if ((requestedUserId === null || requestedUserId === undefined || requestedUserId === "") && !email) {
            return response.status(400).json({ message: "Enter the lawyer's email to create their login account." });
        }

        const temporaryPassword = crypto.randomBytes(18).toString("base64url");
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        let userId;
        let accountEmail;
        if (requestedUserId !== null && requestedUserId !== undefined && requestedUserId !== "") {
            userId = await validateUserLink(requestedUserId);
            if (userId === false) {
                await connection.rollback();
                transactionStarted = false;
                return response.status(400).json({ message: "userId must belong to an existing lawyer account." });
            }
            const [accounts] = await connection.execute(
                "SELECT email FROM users WHERE id = ? AND role = 'lawyer' LIMIT 1 FOR UPDATE",
                [userId]
            );
            if (accounts.length === 0) {
                await connection.rollback();
                transactionStarted = false;
                return response.status(400).json({ message: "The selected lawyer account could not be found." });
            }
            accountEmail = accounts[0].email;
            await connection.execute(
                `UPDATE users
                 SET password_hash = ?, must_change_password = TRUE,
                     password_version = password_version + 1
                 WHERE id = ?`,
                [passwordHash, userId]
            );
        } else {
            const [accountResult] = await connection.execute(
                `INSERT INTO users
                    (name, email, password_hash, role, must_change_password)
                 VALUES (?, ?, ?, 'lawyer', TRUE)`,
                [name, email, passwordHash]
            );
            userId = accountResult.insertId;
            accountEmail = email;
        }

        const [result] = await connection.execute(
            `INSERT INTO lawyers (user_id, name, title, practice_areas, bio, email, phone)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, name, title, practiceAreas, bio || null, email || null, phone]
        );
        await connection.commit();
        transactionStarted = false;
        response.status(201).json({
            id: result.insertId,
            message: "Lawyer profile and login account created.",
            accountEmail,
            temporaryPassword
        });
    } catch (error) {
        if (connection && transactionStarted) await connection.rollback();
        if (error.code === "ER_DUP_ENTRY") {
            return response.status(409).json({ message: "An account already uses that email, or the lawyer account is already linked to a profile." });
        }
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

router.post("/admin/:id/temporary-password", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const [accounts] = await pool.execute(
            `SELECT u.id, u.email
             FROM lawyers l
             JOIN users u ON u.id = l.user_id AND u.role = 'lawyer'
             WHERE l.id = ?
             LIMIT 1`,
            [request.params.id]
        );
        if (accounts.length === 0) {
            return response.status(404).json({ message: "No lawyer account is linked to this profile." });
        }

        const temporaryPassword = crypto.randomBytes(18).toString("base64url");
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        await pool.execute(
            `UPDATE users
             SET password_hash = ?, must_change_password = TRUE,
                 password_version = password_version + 1
             WHERE id = ?`,
            [passwordHash, accounts[0].id]
        );

        response.json({
            message: "Temporary password created. Share it with the lawyer securely.",
            accountEmail: accounts[0].email,
            temporaryPassword
        });
    } catch (error) {
        next(error);
    }
});

router.patch("/admin/:id", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const fields = {
            name: { column: "name", max: 120 },
            title: { column: "title", max: 120 },
            practiceAreas: { column: "practice_areas", max: 255 },
            bio: { column: "bio", max: 20000 },
            email: { column: "email", max: 190 },
            phone: { column: "phone", max: 40 }
        };
        const updates = [];
        const values = [];
        for (const [key, field] of Object.entries(fields)) {
            if (Object.prototype.hasOwnProperty.call(request.body, key)) {
                const value = cleanText(request.body[key]);
                if (value.length > field.max || (["name", "title", "practiceAreas"].includes(key) && !value)) {
                    return response.status(400).json({ message: `Invalid ${key} value.` });
                }
                updates.push(`${field.column} = ?`);
                values.push(value || null);
            }
        }
        if (Object.prototype.hasOwnProperty.call(request.body, "userId")) {
            const userId = await validateUserLink(request.body.userId);
            if (userId === false) {
                return response.status(400).json({ message: "userId must belong to an existing lawyer account." });
            }
            updates.push("user_id = ?");
            values.push(userId);
        }
        if (updates.length === 0) {
            return response.status(400).json({ message: "Provide at least one lawyer field to update." });
        }

        values.push(request.params.id);
        const [result] = await pool.execute(
            `UPDATE lawyers SET ${updates.join(", ")} WHERE id = ?`,
            values
        );
        if (result.affectedRows === 0) {
            const [existing] = await pool.execute("SELECT id FROM lawyers WHERE id = ? LIMIT 1", [request.params.id]);
            if (existing.length === 0) {
                return response.status(404).json({ message: "Lawyer profile not found." });
            }
        }
        response.json({ message: "Lawyer profile updated." });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return response.status(409).json({ message: "That lawyer account is already linked to a profile." });
        }
        next(error);
    }
});

router.delete("/admin/:id", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const [result] = await pool.execute(
            "UPDATE lawyers SET is_active = FALSE WHERE id = ? AND is_active = TRUE",
            [request.params.id]
        );
        if (result.affectedRows === 0) {
            return response.status(404).json({ message: "Active lawyer profile not found." });
        }
        response.json({ message: "Lawyer profile removed from the public directory." });
    } catch (error) {
        next(error);
    }
});

router.get("/dashboard", authenticate, authorize("lawyer"), async (request, response, next) => {
    try {
        const [profiles] = await pool.execute(
            `SELECT l.id, l.user_id, l.name, l.title,
                    l.practice_areas AS practiceAreas, l.bio, l.email, l.phone,
                    u.name AS accountName, u.email AS accountEmail,
                    u.phone AS accountPhone
             FROM lawyers l
             JOIN users u ON u.id = l.user_id AND u.role = 'lawyer'
             WHERE l.user_id = ? AND l.is_active = TRUE
             LIMIT 1`,
            [request.user.id]
        );
        if (profiles.length === 0) {
            return response.status(404).json({ message: "No active lawyer profile is linked to this account." });
        }

        const [consultations] = await pool.execute(
            `SELECT c.id, c.client_id, c.lawyer_id, c.service, c.message,
                    DATE_FORMAT(c.preferred_date, '%Y-%m-%d') AS preferred_date,
                    DATE_FORMAT(c.appointment_at, '%Y-%m-%dT%H:%i') AS appointment_at,
                    (c.status IN ('approved', 'scheduled') AND
                     (c.appointment_at >= NOW() OR
                      (c.appointment_at IS NULL AND c.preferred_date >= CURDATE()))) AS is_upcoming,
                    c.status, c.created_at, c.updated_at,
                    u.name, u.email AS client_email, u.phone AS client_phone,
                    l.name AS lawyer_name
             FROM consultations c
             JOIN users u ON u.id = c.client_id
             JOIN lawyers l ON l.id = c.lawyer_id
             WHERE l.user_id = ?
             ORDER BY c.created_at DESC`,
            [request.user.id]
        );
        const [clientRows] = await pool.execute(
            `SELECT COUNT(DISTINCT c.client_id) AS total
             FROM consultations c
             JOIN lawyers l ON l.id = c.lawyer_id
             WHERE l.user_id = ?`,
            [request.user.id]
        );

        const upcomingAppointments = consultations.filter((consultation) =>
            Boolean(consultation.is_upcoming)
        );
        const stats = {
            totalConsultations: consultations.length,
            pendingConsultations: consultations.filter((item) => item.status === "pending").length,
            approvedConsultations: consultations.filter((item) =>
                ["approved", "scheduled"].includes(item.status)
            ).length,
            completedConsultations: consultations.filter((item) => item.status === "completed").length,
            totalClients: Number(clientRows[0].total),
            upcomingAppointments: upcomingAppointments.length
        };

        response.json({
            profile: profiles[0],
            stats,
            consultations,
            upcomingAppointments,
            recentConsultations: consultations.slice(0, 5)
        });
    } catch (error) {
        next(error);
    }
});

router.get("/", async (request, response, next) => {
    try {
        const [lawyers] = await pool.execute(
            `SELECT id, name, title, practice_areas AS practiceAreas,
                    bio, email, phone
             FROM lawyers
             WHERE is_active = TRUE
             ORDER BY name`
        );
        response.json(lawyers);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", async (request, response, next) => {
    try {
        const [lawyers] = await pool.execute(
            `SELECT id, name, title, practice_areas AS practiceAreas,
                    bio, email, phone
             FROM lawyers
             WHERE id = ? AND is_active = TRUE
             LIMIT 1`,
            [request.params.id]
        );

        if (lawyers.length === 0) {
            return response.status(404).json({ message: "Lawyer not found." });
        }
        response.json(lawyers[0]);
    } catch (error) {
        next(error);
    }
});

module.exports = router;