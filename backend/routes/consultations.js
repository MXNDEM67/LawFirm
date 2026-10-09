const express = require("express");
const pool = require("../database");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

const consultationSelect = `
    SELECT c.id, c.client_id, c.lawyer_id, c.service, c.message,
           c.preferred_date,
           DATE_FORMAT(c.appointment_at, '%Y-%m-%dT%H:%i') AS appointment_at,
           c.status, c.created_at,
           u.name, u.email AS client_email, u.phone AS client_phone,
           l.name AS lawyer_name
    FROM consultations c
    JOIN users u ON u.id = c.client_id
    LEFT JOIN lawyers l ON l.id = c.lawyer_id
`;

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    if (Number(value.slice(0, 4)) < 1000) {
        return false;
    }
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidDateTimeLocal(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
        return false;
    }
    const [, year, month, day, hour, minute] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
        && date.getUTCHours() === hour
        && date.getUTCMinutes() === minute;
}

router.get("/my", authenticate, async (request, response, next) => {
    try {
        let query = `${consultationSelect} ORDER BY c.created_at DESC`;
        let values = [];

        if (request.user.role === "client") {
            query = `${consultationSelect} WHERE c.client_id = ? ORDER BY c.created_at DESC`;
            values = [request.user.id];
        } else if (request.user.role === "lawyer") {
            query = `${consultationSelect}
                     JOIN lawyers assigned_lawyer ON assigned_lawyer.id = c.lawyer_id
                     WHERE assigned_lawyer.user_id = ?
                     ORDER BY c.created_at DESC`;
            values = [request.user.id];
        }

        const [consultations] = await pool.execute(query, values);
        response.json(consultations);
    } catch (error) {
        next(error);
    }
});

router.get("/", authenticate, async (request, response, next) => {
    try {
        let query = `${consultationSelect} ORDER BY c.created_at DESC`;
        let values = [];

        if (request.user.role === "client") {
            query = `${consultationSelect} WHERE c.client_id = ? ORDER BY c.created_at DESC`;
            values = [request.user.id];
        } else if (request.user.role === "lawyer") {
            query = `${consultationSelect}
                     JOIN lawyers assigned_lawyer ON assigned_lawyer.id = c.lawyer_id
                     WHERE assigned_lawyer.user_id = ?
                     ORDER BY c.created_at DESC`;
            values = [request.user.id];
        }

        const [consultations] = await pool.execute(query, values);
        response.json(consultations);
    } catch (error) {
        next(error);
    }
});

router.post("/", authenticate, authorize("client"), async (request, response, next) => {
    try {
        const service = typeof request.body.service === "string"
            ? request.body.service.trim()
            : "";
        const message = typeof request.body.message === "string"
            ? request.body.message.trim()
            : "";
        const preferredDate = request.body.preferredDate ?? request.body.preferred_date ?? null;

        if (!service || service.length > 120 || !message || message.length > 10000) {
            return response.status(400).json({
                message: "A service (up to 120 characters) and message (up to 10,000 characters) are required."
            });
        }
        if (preferredDate !== null && (typeof preferredDate !== "string" || !isValidDate(preferredDate))) {
            return response.status(400).json({ message: "The preferred date must use YYYY-MM-DD format." });
        }

        const [result] = await pool.execute(
            `INSERT INTO consultations (client_id, service, message, preferred_date)
             VALUES (?, ?, ?, ?)`,
            [request.user.id, service, message, preferredDate]
        );
        const [consultations] = await pool.execute(
            `${consultationSelect} WHERE c.id = ?`,
            [result.insertId]
        );

        response.status(201).json(consultations[0]);
    } catch (error) {
        next(error);
    }
});

router.put("/:id/status", authenticate, authorize("lawyer"), async (request, response, next) => {
    try {
        const allowedStatuses = ["approved", "completed", "rejected", "cancelled"];
        const { status, appointmentAt } = request.body;

        if (!allowedStatuses.includes(status)) {
            return response.status(400).json({
                message: `Status must be one of: ${allowedStatuses.join(", ")}.`
            });
        }

        let appointmentValue = null;
        if (appointmentAt !== undefined && appointmentAt !== null && appointmentAt !== "") {
            if (typeof appointmentAt !== "string"
                || !isValidDateTimeLocal(appointmentAt)) {
                return response.status(400).json({
                    message: "Appointment date and time must use YYYY-MM-DDTHH:mm format."
                });
            }
            appointmentValue = appointmentAt.replace("T", " ");
        }

        if (appointmentValue && status !== "approved") {
            return response.status(400).json({
                message: "Set an appointment date and time when approving the consultation."
            });
        }

        await pool.execute(
            `UPDATE consultations c
             JOIN lawyers l ON l.id = c.lawyer_id
             SET c.status = ?,
                 c.appointment_at = CASE
                    WHEN ? = 'approved' AND ? IS NOT NULL THEN ?
                    WHEN ? IN ('rejected', 'cancelled') THEN NULL
                    ELSE c.appointment_at
                 END
             WHERE c.id = ? AND l.user_id = ?`,
            [
                status,
                status,
                appointmentValue,
                appointmentValue,
                status,
                request.params.id,
                request.user.id
            ]
        );

        const [consultations] = await pool.execute(
            `${consultationSelect}
             JOIN lawyers assigned_lawyer ON assigned_lawyer.id = c.lawyer_id
             WHERE c.id = ? AND assigned_lawyer.user_id = ?`,
            [request.params.id, request.user.id]
        );
        if (consultations.length === 0) {
            return response.status(404).json({ message: "Consultation not found or not assigned to you." });
        }
        response.json(consultations[0]);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id/assign", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const lawyerId = request.body.lawyerId;
        if (!Number.isInteger(Number(lawyerId)) || Number(lawyerId) < 1) {
            return response.status(400).json({ message: "A valid lawyerId is required." });
        }

        const [lawyers] = await pool.execute(
            `SELECT l.id
             FROM lawyers l
             JOIN users u ON u.id = l.user_id AND u.role = 'lawyer'
             WHERE l.id = ? AND l.is_active = TRUE
             LIMIT 1`,
            [lawyerId]
        );
        if (lawyers.length === 0) {
            return response.status(404).json({ message: "An active lawyer account was not found." });
        }

        await pool.execute(
            "UPDATE consultations SET lawyer_id = ? WHERE id = ?",
            [Number(lawyerId), request.params.id]
        );
        const [consultations] = await pool.execute(
            `${consultationSelect} WHERE c.id = ?`,
            [request.params.id]
        );
        if (consultations.length === 0) {
            return response.status(404).json({ message: "Consultation not found." });
        }
        response.json(consultations[0]);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id/status", authenticate, async (request, response, next) => {
    try {
        const allowedStatuses = ["pending", "approved", "scheduled", "completed", "rejected", "cancelled"];
        const status = request.body.status;
        if (!allowedStatuses.includes(status)) {
            return response.status(400).json({
                message: `Status must be one of: ${allowedStatuses.join(", ")}.`
            });
        }

        if (request.user.role === "admin") {
            await pool.execute(
                "UPDATE consultations SET status = ? WHERE id = ?",
                [status, request.params.id]
            );
        } else if (request.user.role === "lawyer") {
            await pool.execute(
                `UPDATE consultations c
                 JOIN lawyers l ON l.id = c.lawyer_id
                 SET c.status = ?
                 WHERE c.id = ? AND l.user_id = ?`,
                [status, request.params.id, request.user.id]
            );
        } else {
            return response.status(403).json({ message: "Only admins and assigned lawyers can update status." });
        }

        let selectQuery = `${consultationSelect} WHERE c.id = ?`;
        let selectValues = [request.params.id];
        if (request.user.role === "lawyer") {
            selectQuery = `${consultationSelect}
                           JOIN lawyers assigned_lawyer ON assigned_lawyer.id = c.lawyer_id
                           WHERE c.id = ? AND assigned_lawyer.user_id = ?`;
            selectValues = [request.params.id, request.user.id];
        }
        const [consultations] = await pool.execute(selectQuery, selectValues);
        if (consultations.length === 0) {
            return response.status(404).json({ message: "Consultation not found or not assigned to you." });
        }
        response.json(consultations[0]);
    } catch (error) {
        next(error);
    }
});

module.exports = router;