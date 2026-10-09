function errorHandler(error, request, response, next) {
    if (response.headersSent) {
        return next(error);
    }

    if (error.type === "entity.parse.failed") {
        return response.status(400).json({ message: "Request body must contain valid JSON." });
    }
    if (error.type === "entity.too.large") {
        return response.status(413).json({ message: "Request body is too large." });
    }

    console.error("API error:", error);
    response.status(500).json({ message: "An unexpected server error occurred." });
}

module.exports = errorHandler;
