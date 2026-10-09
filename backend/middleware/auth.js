const jwt = require("jsonwebtoken");
const pool = require("../database");

async function authenticate(request, response, next) {
    const authorization = request.get("Authorization") || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
        return response.status(401).json({ message: "A bearer token is required." });
    }

    try {
        request.user = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await pool.execute(
            "SELECT must_change_password, password_version FROM users WHERE id = ? LIMIT 1",
            [request.user.id]
        );
        if (users.length === 0) {
            return response.status(401).json({ message: "The account associated with this token no longer exists." });
        }
        if (Number(request.user.passwordVersion || 0) !== Number(users[0].password_version)) {
            return response.status(401).json({ message: "Your password changed. Please sign in again." });
        }
        request.user.mustChangePassword = Boolean(users[0].must_change_password);
        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return response.status(401).json({ message: "The token is invalid or expired." });
        }
        next(error);
    }
}

function authorize(...roles) {
    return (request, response, next) => {
        if (!request.user || !roles.includes(request.user.role)) {
            return response.status(403).json({ message: "You do not have permission to access this resource." });
        }
        if (request.user.mustChangePassword) {
            return response.status(403).json({
                code: "PASSWORD_CHANGE_REQUIRED",
                message: "Change your temporary password before continuing."
            });
        }
        next();
    };
}

module.exports = { authenticate, authorize };
