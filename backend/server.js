const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const cors = require("cors");
const express = require("express");
const pool = require("./database");
const bootstrapAdmin = require("./bootstrapAdmin");
const authRoutes = require("./routes/auth");
const lawyersRoutes = require("./routes/lawyers");
const consultationsRoutes = require("./routes/consultations");
const messagesRoutes = require("./routes/messages");
const internalMessagesRoutes = require("./routes/internalMessages");
const dashboardRoutes = require("./routes/dashboard");
const errorHandler = require("./middleware/errorHandler");

if (!process.env.JWT_SECRET) {
    throw new Error("Missing required environment variable: JWT_SECRET");
}

const app = express();
const port = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use((request, response, next) => {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
        request.body = {};
    }
    next();
});

app.get("/api/health", async (request, response, next) => {
    try {
        await pool.query("SELECT 1");
        response.json({ status: "ok" });
    } catch (error) {
        next(error);
    }
});

app.use("/api/auth", authRoutes);
app.use("/api/lawyers", lawyersRoutes);
app.use("/api/consultations", consultationsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/internal-messages", internalMessagesRoutes);
app.use("/api", dashboardRoutes);

app.use((request, response) => {
    response.status(404).json({ message: "Route not found." });
});

app.use(errorHandler);

async function startServer() {
    try {
        await bootstrapAdmin();
        app.listen(port, () => {
            console.log(`Law firm API listening on http://localhost:${port}`);
        });
    } catch (error) {
        console.error("Unable to initialize the API:", error);
        process.exitCode = 1;
    }
}

startServer();

module.exports = app;