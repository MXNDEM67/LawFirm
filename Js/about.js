// ============================================================
// LAW FIRM
// ABOUT PAGE JAVASCRIPT
// ============================================================

document.addEventListener("DOMContentLoaded", function () {

    const valueCards = document.querySelectorAll(".value-card");

    valueCards.forEach(function (card) {

        card.addEventListener("mouseenter", function () {
            this.style.transform = "translateY(-5px)";
        });

        card.addEventListener("mouseleave", function () {
            this.style.transform = "translateY(0)";
        });

    });

});