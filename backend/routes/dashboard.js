const express = require("express");
const pool = require("../database");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/admin/users", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const [users] = await pool.execute(
            `SELECT id, name, email, phone, role, created_at
             FROM users
             ORDER BY created_at DESC`
        );
        response.json(users);
    } catch (error) {
        next(error);
    }
});

router.get("/admin/stats", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                (SELECT COUNT(*) FROM users) AS totalUsers,
                (SELECT COUNT(*) FROM lawyers WHERE is_active = TRUE) AS totalLawyers,
                (SELECT COUNT(*) FROM users WHERE role = 'client') AS totalClients,
                (SELECT COUNT(*) FROM consultations) AS totalConsultations,
                (SELECT COUNT(*) FROM consultations WHERE status = 'pending') AS pendingConsultations,
                (SELECT COUNT(*) FROM consultations WHERE status = 'completed') AS completedConsultations,
                (SELECT COUNT(*) FROM messages) AS totalMessages`
        );
        const stats = Object.fromEntries(
            Object.entries(rows[0]).map(([key, value]) => [key, Number(value)])
        );
        response.json(stats);
    } catch (error) {
        next(error);
    }
});

router.get("/admin/activity", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        const [activity] = await pool.execute(
            `SELECT recent_activity.activity_type AS type,
                    recent_activity.activity_id AS id,
                    recent_activity.description,
                    recent_activity.created_at,
                    (activity_reads.user_id IS NOT NULL) AS is_read
             FROM (
                 SELECT 'consultation' AS activity_type, c.id AS activity_id,
                        CONCAT('Consultation request from ', u.name, ' (', c.status, ')') AS description,
                        c.updated_at AS created_at
                 FROM consultations c
                 JOIN users u ON u.id = c.client_id
                 UNION ALL
                 SELECT 'user', u.id, CONCAT('New ', u.role, ' account: ', u.name), u.created_at
                 FROM users u
                 UNION ALL
                 SELECT 'message', m.id, CONCAT('Contact message from ', m.name), m.created_at
                 FROM messages m
                 UNION ALL
                 SELECT 'lawyer', l.id, CONCAT('Lawyer profile added: ', l.name), l.created_at
                 FROM lawyers l
             ) recent_activity
             LEFT JOIN admin_activity_reads activity_reads
                ON activity_reads.user_id = ?
                AND activity_reads.event_type = recent_activity.activity_type
                AND activity_reads.event_id = recent_activity.activity_id
             WHERE activity_reads.user_id IS NULL
             ORDER BY recent_activity.created_at DESC
             LIMIT 15`,
            [request.user.id]
        );
        response.json(activity);
    } catch (error) {
        next(error);
    }
});

router.post("/admin/activity/read-all", authenticate, authorize("admin"), async (request, response, next) => {
    try {
        await pool.execute(
            `INSERT IGNORE INTO admin_activity_reads (user_id, event_type, event_id, read_at)
             SELECT ?, recent_activity.activity_type, recent_activity.activity_id, CURRENT_TIMESTAMP
             FROM (
                 SELECT 'consultation' AS activity_type, c.id AS activity_id
                 FROM consultations c
                 UNION ALL
                 SELECT 'user', u.id
                 FROM users u
                 UNION ALL
                 SELECT 'message', m.id
                 FROM messages m
                 UNION ALL
                 SELECT 'lawyer', l.id
                 FROM lawyers l
             ) recent_activity`,
            [request.user.id]
        );
        response.status(204).end();
    } catch (error) {
        next(error);
    }
});

router.post("/admin/activity/read", authenticate, authorize("admin"), async (request, response, next) => {
    const { activity } = request.body;
    const validTypes = new Set(["consultation", "user", "message", "lawyer"]);

    if (!Array.isArray(activity) || activity.length > 15 ||
        activity.some((item) =>
            !item || !validTypes.has(item.type) ||
            !Number.isInteger(Number(item.id)) || Number(item.id) < 1
        )) {
        return response.status(400).json({ message: "Activity must contain up to 15 valid activity type and ID pairs." });
    }

    if (activity.length === 0) {
        return response.status(204).end();
    }

    try {
        const placeholders = activity.map(() => "(?, ?, ?, CURRENT_TIMESTAMP)").join(", ");
        const values = activity.flatMap(({ type, id }) => [
            request.user.id,
            type,
            Number(id)
        ]);
        await pool.execute(
            `INSERT IGNORE INTO admin_activity_reads (user_id, event_type, event_id, read_at)
             VALUES ${placeholders}`,
            values
        );
        response.status(204).end();
    } catch (error) {
        next(error);
    }
});

router.get("/clients/dashboard", authenticate, authorize("client"), async (request, response, next) => {
    try {
        const [accountRows] = await pool.execute(
            `SELECT id, name, email, phone, created_at
             FROM users
             WHERE id = ? AND role = 'client'
             LIMIT 1`,
            [request.user.id]
        );
        if (accountRows.length === 0) {
            return response.status(404).json({ message: "Client account not found." });
        }

        const [consultations] = await pool.execute(
            `SELECT c.id, c.client_id, c.lawyer_id, c.service, c.message,
                    DATE_FORMAT(c.preferred_date, '%Y-%m-%d') AS preferred_date,
                    DATE_FORMAT(c.appointment_at, '%Y-%m-%dT%H:%i') AS appointment_at,
                    (c.status IN ('approved', 'scheduled') AND
                     (c.appointment_at >= NOW() OR
                      (c.appointment_at IS NULL AND c.preferred_date >= CURDATE()))) AS is_upcoming,
                    c.status, c.created_at, c.updated_at,
                    u.name, u.email AS client_email, l.name AS lawyer_name
             FROM consultations c
             JOIN users u ON u.id = c.client_id
             LEFT JOIN lawyers l ON l.id = c.lawyer_id
             WHERE c.client_id = ?
             ORDER BY c.created_at DESC`,
            [request.user.id]
        );
        const stats = {
            totalConsultations: consultations.length,
            pendingConsultations: consultations.filter((item) => item.status === "pending").length,
            approvedConsultations: consultations.filter((item) =>
                ["approved", "scheduled"].includes(item.status)
            ).length,
            completedConsultations: consultations.filter((item) => item.status === "completed").length
        };
        const appointments = consultations.filter((item) =>
            Boolean(item.is_upcoming)
        );
        const updates = consultations
            .filter((item) => new Date(item.updated_at).getTime() > new Date(item.created_at).getTime())
            .slice(0, 10)
            .map((item) => ({
                consultationId: item.id,
                service: item.service,
                status: item.status,
                lawyerName: item.lawyer_name,
                updatedAt: item.updated_at
            }));

        response.json({
            account: accountRows[0],
            stats: {
                ...stats,
                upcomingAppointments: appointments.length
            },
            appointments,
            updates
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
