// ============================================================
// LAW FIRM
// CONTACT PAGE JAVASCRIPT
// ============================================================

document.addEventListener("DOMContentLoaded", function () {

    const contactForm = document.getElementById("contactForm");
    const formMessage = document.getElementById("formMessage");

    if (!contactForm) {
        return;
    }

    contactForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const service = document.getElementById("service").value;
        const message = document.getElementById("message").value.trim();

        // Basic validation
        if (!name || !email || !phone || !service || !message) {

            formMessage.textContent = "Please complete all fields.";
            formMessage.className = "form-message error";

            return;
        }

        // Simple email validation
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {

            formMessage.textContent = "Please enter a valid email address.";
            formMessage.className = "form-message error";

            return;
        }

        // Show sending message
        formMessage.textContent = "Sending your message...";
        formMessage.className = "form-message";

        try {

            const response = await fetch(
                "http://localhost:5000/api/messages",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        name: name,
                        email: email,
                        phone: phone,
                        service: service,
                        message: message
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Something went wrong.");
            }

            formMessage.textContent =
                "Your message has been sent successfully. We will contact you soon.";

            formMessage.className = "form-message success";

            contactForm.reset();

        } catch (error) {

            console.error("Contact form error:", error);

            formMessage.textContent =
                "Unable to send your message right now. Please try again later.";

            formMessage.className = "form-message error";
        }

    });

});