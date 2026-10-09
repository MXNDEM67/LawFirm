document.addEventListener("DOMContentLoaded", function () {
    const registerForm = document.getElementById("registerForm");
    const registerMessage = document.getElementById("registerMessage");

    if (!registerForm || !registerMessage) {
        return;
    }

    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {
            registerMessage.textContent = "The passwords do not match.";
            registerMessage.className = "login-message error";
            return;
        }

        registerMessage.textContent = "Creating your account...";
        registerMessage.className = "login-message";

        try {
            const response = await fetch("http://localhost:5000/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name, email, password })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to create your account.");
            }

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            window.location.href = "dashboard.html";
        } catch (error) {
            console.error("Registration error:", error);
            registerMessage.textContent =
                error.message || "Unable to create your account. Please try again.";
            registerMessage.className = "login-message error";
        }
    });
});
