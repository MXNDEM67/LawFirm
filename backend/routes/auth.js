const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../database");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createToken(user, passwordVersion = 0) {
    return jwt.sign(
        {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            mustChangePassword: Boolean(user.mustChangePassword),
            passwordVersion
        },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
    );
}

router.post("/register", async (request, response, next) => {
    try {
        const name = typeof request.body.name === "string"
            ? request.body.name.trim()
            : "";
        const email = typeof request.body.email === "string"
            ? request.body.email.trim().toLowerCase()
            : "";
        const password = request.body.password;

        if (!name || name.length > 120 || email.length > 190 || !emailPattern.test(email)
            || typeof password !== "string" || password.length < 8
            || Buffer.byteLength(password, "utf8") > 72) {
            return response.status(400).json({
                message: "Enter a name (up to 120 characters), a valid email (up to 190 characters), and a password of 8 to 72 bytes."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'client')",
            [name, email, passwordHash]
        );
        const user = {
            id: result.insertId,
            name,
            email,
            role: "client",
            mustChangePassword: false
        };

        response.status(201).json({ token: createToken(user), user });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return response.status(409).json({ message: "An account with that email already exists." });
        }
        next(error);
    }
});

router.post("/login", async (request, response, next) => {
    try {
        const email = typeof request.body.email === "string"
            ? request.body.email.trim().toLowerCase()
            : "";
        const password = request.body.password;

        if (email.length > 190 || !emailPattern.test(email)
            || typeof password !== "string" || !password) {
            return response.status(400).json({ message: "Enter a valid email address and password." });
        }

        const [users] = await pool.execute(
            `SELECT id, name, email, password_hash, role, must_change_password, password_version
             FROM users WHERE email = ? LIMIT 1`,
            [email]
        );
        const user = users[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return response.status(401).json({ message: "Invalid email or password." });
        }

        const publicUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            mustChangePassword: Boolean(user.must_change_password)
        };

        response.json({
            token: createToken(publicUser, Number(user.password_version)),
            user: publicUser
        });
    } catch (error) {
        next(error);
    }
});

router.post("/change-temporary-password", authenticate, async (request, response, next) => {
    try {
        const password = request.body.newPassword;
        if (typeof password !== "string" || password.length < 8
            || Buffer.byteLength(password, "utf8") > 72) {
            return response.status(400).json({
                message: "Choose a password that is at least 8 characters and no more than 72 bytes."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const [result] = await pool.execute(
            `UPDATE users
             SET password_hash = ?, must_change_password = FALSE,
                 password_version = password_version + 1
             WHERE id = ? AND role = 'lawyer' AND must_change_password = TRUE`,
            [passwordHash, request.user.id]
        );
        if (result.affectedRows === 0) {
            return response.status(409).json({
                message: "This lawyer account does not require a temporary password change."
            });
        }

        const user = {
            id: request.user.id,
            name: request.user.name,
            email: request.user.email,
            role: request.user.role,
            mustChangePassword: false
        };
        response.json({
            token: createToken(user, Number(request.user.passwordVersion || 0) + 1),
            user
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;