// ============================================================
// LAW FIRM
// LAWYERS PAGE JAVASCRIPT
// ============================================================

document.addEventListener("DOMContentLoaded", function () {

    const lawyerCards = document.querySelectorAll(".lawyer-card");

    lawyerCards.forEach(function (card) {

        card.addEventListener("mouseenter", function () {
            this.classList.add("highlighted");
        });

        card.addEventListener("mouseleave", function () {
            this.classList.remove("highlighted");
        });

    });

});