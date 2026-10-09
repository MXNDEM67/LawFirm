// ============================================================
// LAW FIRM
// LOGIN PAGE JAVASCRIPT
// ============================================================

document.addEventListener("DOMContentLoaded", function () {

    const loginForm = document.getElementById("loginForm");
    const loginMessage = document.getElementById("loginMessage");
    const passwordInput = document.getElementById("password");
    const passwordToggle = document.querySelector(".password-toggle");

    if (!loginForm) {
        return;
    }

    passwordToggle?.addEventListener("click", function () {
        const isPasswordVisible = passwordInput.type === "password";
        passwordInput.type = isPasswordVisible ? "text" : "password";
        passwordToggle.setAttribute("aria-pressed", String(isPasswordVisible));
        passwordToggle.setAttribute("aria-label", isPasswordVisible ? "Hide password" : "Show password");
        passwordToggle.querySelector(".password-eye").hidden = isPasswordVisible;
        passwordToggle.querySelector(".password-eye-off").hidden = !isPasswordVisible;
    });

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        if (!email || !password) {

            loginMessage.textContent =
                "Please enter your email and password.";

            loginMessage.className = "login-message error";

            return;
        }

        loginMessage.textContent = "Signing you in...";
        loginMessage.className = "login-message";

        try {

            const response = await fetch(
                "http://localhost:5000/api/auth/login",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        email: email,
                        password: password
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Login failed.");
            }

            // Save login information
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            loginMessage.textContent = "Login successful.";

            loginMessage.className = "login-message success";

            // Go to dashboard
            setTimeout(function () {
                window.location.href = "dashboard.html";
            }, 700);

        } catch (error) {

            console.error("Login error:", error);

            loginMessage.textContent =
                error.message || "Invalid email or password.";

            loginMessage.className = "login-message error";
        }

    });

});