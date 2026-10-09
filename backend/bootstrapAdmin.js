const bcrypt = require("bcryptjs");
const pool = require("./database");

async function bootstrapAdmin() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!email && !password) {
        return;
    }
    if (!email || !password) {
        throw new Error("Set both ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap the administrator account.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) {
        throw new Error("ADMIN_EMAIL must be a valid email address of at most 190 characters.");
    }
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
        throw new Error("ADMIN_PASSWORD must be between 8 and 72 bytes.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ('Administrator', ?, ?, 'admin')
         ON DUPLICATE KEY UPDATE
             name = 'Administrator',
             password_hash = VALUES(password_hash),
             role = 'admin'`,
        [email, passwordHash]
    );
    console.log(`Administrator account is ready for ${email}.`);
}

module.exports = bootstrapAdmin;
