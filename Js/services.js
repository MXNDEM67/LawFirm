// ============================================================
// LAW FIRM
// SERVICES PAGE JAVASCRIPT
// ============================================================

document.addEventListener("DOMContentLoaded", function () {

    const serviceCards = document.querySelectorAll(".service-card");

    serviceCards.forEach(function (card) {

        card.addEventListener("click", function () {

            serviceCards.forEach(function (item) {
                item.classList.remove("active");
            });

            this.classList.add("active");
        });

    });

});