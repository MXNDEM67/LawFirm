const API_BASE = "http://localhost:5000/api";
const userName = document.getElementById("userName");
const userRole = document.getElementById("userRole");
const dashboardTitle = document.getElementById("dashboardTitle");
const dashboardWelcome = document.getElementById("dashboardWelcome");
const dashboardHeader = document.querySelector(".dashboard-header");
const adminDashboard = document.getElementById("adminDashboard");
const lawyerDashboard = document.getElementById("lawyerDashboard");
const clientDashboard = document.getElementById("clientDashboard");
const logoutButton = document.getElementById("logoutButton");
const adminNotice = document.getElementById("adminNotice");
const adminNoticeMessage = document.getElementById("adminNoticeMessage");
let adminNoticeTimer;
let adminLawyers = [];
let adminUsers = [];
let dashboardUser = null;
let activeInternalInbox = null;
let selectedChatContactId = null;
let chatRefreshTimer = null;
let chatRefreshInProgress = false;
let adminInboxUnreadTimer = null;
let lawyerInboxUnreadTimer = null;

document.addEventListener("DOMContentLoaded", function () {
    const preferredDateInput = document.getElementById("preferredDate");
    if (preferredDateInput) {
        const today = new Date();
        preferredDateInput.min = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0")
        ].join("-");
    }

    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token || !storedUser) {
        window.location.href = "login.html";
        return;
    }

    let user;
    try {
        user = JSON.parse(storedUser);
    } catch (error) {
        console.error("Invalid user data:", error);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "login.html";
        return;
    }

    dashboardUser = user;
    displayUser(user);
    showDashboard(user.role);
    if (user.mustChangePassword) {
        const dialog = document.getElementById("requiredPasswordDialog");
        dialog.addEventListener("cancel", (event) => event.preventDefault());
        dialog.showModal();
    }
});

function displayUser(user) {
    if (userName) userName.textContent = user.name || user.email;
    if (userRole) userRole.textContent = formatRole(user.role);
    if (dashboardWelcome) dashboardWelcome.textContent = `Welcome back, ${user.name || "User"}.`;
}

function formatRole(role) {
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
}

function showDashboard(role) {
    [adminDashboard, lawyerDashboard, clientDashboard].forEach((section) => {
        if (section) section.style.display = "none";
    });

    if (role === "admin") {
        adminDashboard.style.display = "grid";
        dashboardTitle.textContent = "Administrator Dashboard";
        if (!dashboardUser.mustChangePassword) {
            loadAdminDashboard();
            startInternalInboxUnreadPolling("admin");
        }
    } else if (role === "lawyer") {
        dashboardHeader.hidden = true;
        lawyerDashboard.style.display = "grid";
        dashboardTitle.textContent = "Lawyer Dashboard";
        if (!dashboardUser.mustChangePassword) {
            loadLawyerDashboard();
            startInternalInboxUnreadPolling("lawyer");
        }
    } else if (role === "client") {
        dashboardHeader.hidden = true;
        clientDashboard.style.display = "grid";
        dashboardTitle.textContent = "Client Dashboard";
        if (!dashboardUser.mustChangePassword) loadClientDashboard();
    } else {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "login.html";
    }
}

async function apiRequest(path, options = {}) {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        cache: options.cache || "no-store",
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });

    const data = response.status === 204 ? null : await response.json();
    if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "login.html";
        throw new Error("Your session has expired. Please sign in again.");
    }
    if (data?.code === "PASSWORD_CHANGE_REQUIRED") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "login.html";
        throw new Error("Your administrator reset your password. Sign in with the temporary password to continue.");
    }
    if (!response.ok) {
        throw new Error(data?.message || "The request could not be completed.");
    }
    return data;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function formatDate(value) {
    if (!value) return "—";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function setNotice(message, isError = false) {
    if (!adminNotice) return;
    window.clearTimeout(adminNoticeTimer);
    if (!message) {
        adminNotice.hidden = true;
        adminNotice.className = "admin-notice";
        return;
    }

    adminNoticeMessage.textContent = message;
    adminNotice.className = `admin-notice${isError ? " error" : ""}`;
    adminNotice.hidden = false;
    adminNoticeTimer = window.setTimeout(() => {
        adminNotice.hidden = true;
    }, isError ? 7000 : 4500);
}

adminNotice?.querySelector(".admin-notice-dismiss")?.addEventListener("click", () => {
    window.clearTimeout(adminNoticeTimer);
    adminNotice.hidden = true;
});

async function loadAdminDashboard() {
    setNotice("");
    const userResult = await Promise.allSettled([loadAdminUsers()]);
    const lawyerResult = await Promise.allSettled([loadAdminLawyers()]);
    const results = await Promise.allSettled([
        loadAdminStats(),
        loadAdminConsultations(),
        loadAdminMessages(),
        loadAdminActivity()
    ]);
    const errors = [...userResult, ...lawyerResult, ...results]
        .filter((result) => result.status === "rejected");
    if (errors.length) {
        console.error("Some admin dashboard data could not be loaded:", errors.map((item) => item.reason));
        setNotice("Some dashboard data could not be loaded. Check the backend connection and refresh.", true);
    }
    return errors.length === 0;
}

async function loadAdminStats() {
    const stats = await apiRequest("/admin/stats");
    for (const key of [
        "totalUsers", "totalLawyers", "totalClients", "totalConsultations",
        "pendingConsultations", "completedConsultations", "totalMessages"
    ]) {
        const element = document.getElementById(key);
        if (element) element.textContent = Number(stats[key] || 0).toLocaleString();
    }
}

async function loadAdminUsers() {
    adminUsers = await apiRequest("/admin/users");
    const rows = adminUsers.map((user) => `
        <tr>
            <td><strong>${escapeHtml(user.name)}</strong></td>
            <td>${escapeHtml(user.email)}</td>
            <td><span class="role-badge">${escapeHtml(user.role)}</span></td>
            <td>${formatDate(user.created_at)}</td>
        </tr>`).join("");
    document.getElementById("usersTable").innerHTML =
        rows || '<tr><td colspan="4" class="empty-state">No accounts have been registered yet.</td></tr>';
}

async function loadAdminLawyers() {
    adminLawyers = await apiRequest("/lawyers/admin");
    const lawyerUsers = adminUsers.filter((user) => user.role === "lawyer");
    const rows = adminLawyers.map((lawyer) => `
        <tr>
            <td><strong>${escapeHtml(lawyer.name)}</strong><small>${escapeHtml(lawyer.title)}</small></td>
            <td>${escapeHtml(lawyer.practiceAreas)}</td>
            <td>${escapeHtml(lawyer.accountEmail || "No account linked")}</td>
            <td><span class="status-badge ${lawyer.isActive ? "status-active" : "status-cancelled"}">${lawyer.isActive ? "Active" : "Removed"}</span></td>
            <td class="action-cell">
                <button class="text-button" type="button" data-action="edit-lawyer" data-id="${lawyer.id}">Edit</button>
                ${lawyer.user_id ? `<button class="text-button" type="button" data-action="reset-lawyer-password" data-id="${lawyer.id}">Reset password</button>` : ""}
                ${lawyer.isActive ? `<button class="text-button danger" type="button" data-action="remove-lawyer" data-id="${lawyer.id}">Remove</button>` : ""}
            </td>
        </tr>`).join("");
    document.getElementById("lawyersTable").innerHTML =
        rows || '<tr><td colspan="5" class="empty-state">No lawyer profiles found.</td></tr>';

    const accountOptions = lawyerUsers.map((user) =>
        `<option value="${user.id}">${escapeHtml(user.name)} — ${escapeHtml(user.email)}</option>`
    ).join("");
    document.getElementById("lawyerUserId").innerHTML =
        `<option value="">No linked account</option>${accountOptions}`;
}

async function loadAdminConsultations() {
    const consultations = await apiRequest("/consultations");
    const assignableLawyers = adminLawyers.filter((lawyer) => lawyer.isActive && lawyer.user_id);
    const rows = consultations.map((consultation) => `
        <tr>
            <td><strong>${escapeHtml(consultation.name)}</strong><small>${escapeHtml(consultation.service)}</small><span class="table-detail">${escapeHtml(consultation.message)}</span></td>
            <td>${escapeHtml(consultation.lawyer_name || "Unassigned")}</td>
            <td>${formatDate(consultation.created_at)}</td>
            <td><select class="table-select" aria-label="Assign consultation ${consultation.id}" data-action="assign-consultation" data-id="${consultation.id}">
                <option value="">Choose lawyer</option>
                ${assignableLawyers.map((lawyer) => `<option value="${lawyer.id}" ${String(lawyer.id) === String(consultation.lawyer_id) ? "selected" : ""}>${escapeHtml(lawyer.name)}</option>`).join("")}
            </select></td>
            <td><select class="table-select status-select" aria-label="Change consultation ${consultation.id} status" data-action="change-status" data-id="${consultation.id}">
                ${["pending", "approved", "scheduled", "completed", "rejected", "cancelled"].map((status) => `<option value="${status}" ${status === consultation.status ? "selected" : ""}>${escapeHtml(formatRole(status))}</option>`).join("")}
            </select></td>
        </tr>`).join("");
    document.getElementById("consultationsTable").innerHTML =
        rows || '<tr><td colspan="5" class="empty-state">No consultation requests have been submitted.</td></tr>';
}

async function loadAdminMessages() {
    const messages = await apiRequest("/messages");
    const rows = messages.map((message) => `
        <tr>
            <td><strong>${escapeHtml(message.name)}</strong><small>${escapeHtml(message.email)}</small><small>${escapeHtml(message.phone)}</small></td>
            <td>${escapeHtml(message.service)}</td>
            <td class="table-detail">${escapeHtml(message.message)}</td>
            <td>${formatDate(message.created_at)}</td>
            <td><button class="text-button danger" type="button" data-action="delete-message" data-id="${message.id}">Delete</button></td>
        </tr>`).join("");
    document.getElementById("messagesTable").innerHTML =
        rows || '<tr><td colspan="5" class="empty-state">Your inbox is clear.</td></tr>';
}

async function loadAdminActivity() {
    const activity = await apiRequest("/admin/activity");

    const html = activity.map((item) => `
        <article class="activity-item is-unread" data-activity-key="${escapeHtml(item.type)}-${escapeHtml(item.id)}">
            <span class="activity-mark" aria-hidden="true"></span>
            <div class="activity-content"><strong>${escapeHtml(item.description)}</strong><small>${formatDate(item.created_at)} · ${escapeHtml(item.type)} · Unread</small></div>
            <button class="activity-read-button" type="button" data-action="mark-activity-read" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">Mark as read</button>
        </article>`).join("");
    const emptyState = '<p class="empty-state">No unread activity to display.</p>';
    document.getElementById("activityList").innerHTML = html || emptyState;
    document.getElementById("overviewActivity").innerHTML =
        activity.length
            ? activity.slice(0, 3).map((item) => `
                <article class="activity-item is-unread" data-activity-key="${escapeHtml(item.type)}-${escapeHtml(item.id)}">
                    <span class="activity-mark" aria-hidden="true"></span>
                    <div class="activity-content"><strong>${escapeHtml(item.description)}</strong><small>${formatDate(item.created_at)} · ${escapeHtml(item.type)} · Unread</small></div>
                    <button class="activity-read-button" type="button" data-action="mark-activity-read" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">Mark as read</button>
                </article>`).join("")
            : emptyState;
}

function showAdminView(viewName) {
    document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
        const isActive = panel.dataset.adminPanel === viewName;
        panel.hidden = !isActive;
        panel.classList.toggle("active", isActive);
    });
    const adminContent = document.querySelector(".admin-content");
    const inboxPanel = document.getElementById("adminInternalInbox");
    const openInboxButton = document.getElementById("adminOpenInboxButton");
    const refreshInboxButton = document.querySelector('[data-chat-refresh="admin"]');
    const closeInboxButton = document.getElementById("adminCloseInboxButton");
    if (viewName === "inbox") {
        inboxPanel.hidden = true;
        openInboxButton.hidden = false;
        openInboxButton.setAttribute("aria-expanded", "false");
        refreshInboxButton.hidden = true;
        closeInboxButton.hidden = true;
        adminContent.classList.add("admin-inbox-collapsed");
    } else {
        adminContent.classList.remove("admin-inbox-collapsed");
    }
    document.querySelectorAll("[data-admin-view]").forEach((button) => {
        button.classList.toggle("active", button.dataset.adminView === viewName);
    });
    if (viewName === "inbox") {
        stopInternalInboxPolling();
    } else if (activeInternalInbox === "admin") {
        stopInternalInboxPolling();
    }
    if (viewName === "activity") {
        loadAdminActivity()
            .then(() => setNotice("Recent activity loaded."))
            .catch((error) => {
                console.error("Unable to refresh recent activity:", error);
                setNotice(error.message || "Unable to refresh recent activity.", true);
            });
    }
}

function internalInboxElements(role) {
    const prefix = role === "admin" ? "adminChat" : "lawyerChat";
    return {
        prefix,
        contacts: document.getElementById(`${prefix}Contacts`),
        contactCount: document.getElementById(`${prefix}ContactCount`),
        avatar: document.getElementById(`${prefix}Avatar`),
        name: document.getElementById(`${prefix}Name`),
        email: document.getElementById(`${prefix}Email`),
        messages: document.getElementById(`${prefix}Messages`),
        form: document.getElementById(`${role}ChatForm`),
        input: document.getElementById(`${prefix}Input`)
    };
}

function formatMessageTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function showInternalInboxNotice(role, message, isError = false) {
    if (role === "admin") {
        setNotice(message, isError);
    } else {
        setLawyerNotice(message, isError);
    }
}

function renderInternalMessages(role, messages) {
    const elements = internalInboxElements(role);
    if (!messages.length) {
        elements.messages.innerHTML = '<p class="internal-empty-thread">No messages yet. Start the conversation below.</p>';
        return;
    }

    const wasNearBottom = elements.messages.scrollHeight
        - elements.messages.scrollTop
        - elements.messages.clientHeight < 50;
    elements.messages.innerHTML = messages.map((message) => {
        const isSent = Number(message.sender_id) === Number(dashboardUser.id);
        return `
            <article class="internal-message ${isSent ? "sent" : "received"}">
                <p>${escapeHtml(message.message)}</p>
                <time datetime="${escapeHtml(message.created_at)}">${isSent ? "You" : "Contact"} · ${escapeHtml(formatMessageTime(message.created_at))}</time>
            </article>`;
    }).join("");
    if (wasNearBottom) {
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }
}

async function refreshInternalThread(role, markAsRead = false) {
    if (activeInternalInbox !== role || !selectedChatContactId) return;
    const contactId = selectedChatContactId;
    if (markAsRead) {
        await apiRequest(`/internal-messages/${contactId}/read`, { method: "POST" });
        await refreshInternalInboxUnreadCount(role);
    }
    const messages = await apiRequest(`/internal-messages/${contactId}`);
    if (activeInternalInbox !== role || Number(selectedChatContactId) !== Number(contactId)) return;
    renderInternalMessages(role, messages);
}

function renderInternalContacts(role, contacts) {
    const elements = internalInboxElements(role);
    const label = role === "admin" ? "lawyers" : "admins";
    elements.contactCount.textContent = `${contacts.length} ${label}`;
    elements.contacts.innerHTML = contacts.length
        ? contacts.map((contact) => `
            <button class="internal-contact${Number(contact.id) === Number(selectedChatContactId) ? " active" : ""}" type="button" data-chat-contact="${contact.id}" data-chat-role="${role}">
                <span class="internal-contact-avatar">${escapeHtml(contact.name.trim().charAt(0).toUpperCase())}</span>
                <span class="internal-contact-copy"><strong>${escapeHtml(contact.name)}</strong><small>${escapeHtml(contact.last_message || contact.email)}</small></span>
                ${Number(contact.unread_count) ? `<span class="internal-unread-count">${Number(contact.unread_count)}</span>` : ""}
            </button>`).join("")
        : `<p class="empty-state">No ${label} accounts are available yet.</p>`;
}

async function loadInternalContacts(role) {
    const elements = internalInboxElements(role);
    const contacts = await apiRequest("/internal-messages/contacts");
    updateInternalInboxUnreadCount(role, contacts);
    if (activeInternalInbox !== role) return;
    renderInternalContacts(role, contacts);

    const selectedContact = contacts.find((contact) =>
        Number(contact.id) === Number(selectedChatContactId)
    );
    if (!selectedContact) {
        selectedChatContactId = null;
        elements.avatar.textContent = "—";
        elements.name.textContent = role === "admin" ? "Select a lawyer" : "Select an administrator";
        elements.email.textContent = "Your conversations are private.";
        elements.messages.innerHTML = '<p class="internal-empty-thread">Choose a contact to open a conversation.</p>';
        elements.input.disabled = true;
        elements.form.querySelector("button[type='submit']").disabled = true;
        return;
    }

    elements.avatar.textContent = selectedContact.name.trim().charAt(0).toUpperCase();
    elements.name.textContent = selectedContact.name;
    elements.email.textContent = selectedContact.email;
    elements.input.disabled = false;
    elements.form.querySelector("button[type='submit']").disabled = false;
    await refreshInternalThread(role, Number(selectedContact.unread_count) > 0);
}

function updateInternalInboxUnreadCount(role, contacts) {
    const badge = document.getElementById(
        role === "admin" ? "adminInboxUnreadCount" : "lawyerInboxUnreadCount"
    );
    if (!badge) return;
    const unreadCount = contacts.reduce((total, contact) =>
        total + Math.max(0, Number(contact.unread_count) || 0), 0
    );
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.hidden = unreadCount === 0;
    badge.setAttribute("aria-label", `${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`);
    const inboxButton = role === "admin"
        ? document.querySelector('[data-admin-view="inbox"]')
        : document.querySelector('[data-lawyer-target="lawyerInboxPanel"]');
    if (inboxButton) {
        inboxButton.setAttribute(
            "aria-label",
            `${role === "admin" ? "Lawyer inbox" : "Inbox"}${unreadCount ? `, ${unreadCount} unread messages` : ""}`
        );
    }
}

async function refreshInternalInboxUnreadCount(role) {
    const contacts = await apiRequest("/internal-messages/contacts");
    updateInternalInboxUnreadCount(role, contacts);
}

function startInternalInboxUnreadPolling(role) {
    const timer = role === "admin" ? adminInboxUnreadTimer : lawyerInboxUnreadTimer;
    window.clearInterval(timer);
    refreshInternalInboxUnreadCount(role).catch((error) => {
        console.error(`Unable to load ${role} inbox unread count:`, error);
    });
    const nextTimer = window.setInterval(() => {
        if (document.hidden || dashboardUser?.role !== role) return;
        refreshInternalInboxUnreadCount(role).catch((error) => {
            console.error(`Unable to refresh ${role} inbox unread count:`, error);
        });
    }, 10000);
    if (role === "admin") {
        adminInboxUnreadTimer = nextTimer;
    } else {
        lawyerInboxUnreadTimer = nextTimer;
    }
}

function stopInternalInboxPolling() {
    activeInternalInbox = null;
    window.clearInterval(chatRefreshTimer);
    chatRefreshTimer = null;
}

function openInternalInbox(role) {
    stopInternalInboxPolling();
    activeInternalInbox = role;
    selectedChatContactId = null;
    loadInternalContacts(role).catch((error) => {
        console.error("Unable to load internal inbox:", error);
        showInternalInboxNotice(role, error.message || "Unable to load your inbox.", true);
    });
    chatRefreshTimer = window.setInterval(async () => {
        if (document.hidden || chatRefreshInProgress || activeInternalInbox !== role) return;
        chatRefreshInProgress = true;
        try {
            await loadInternalContacts(role);
        } catch (error) {
            console.error("Unable to refresh internal inbox:", error);
        } finally {
            chatRefreshInProgress = false;
        }
    }, 6000);
}

adminDashboard?.addEventListener("click", async (event) => {
    const contactButton = event.target.closest("[data-chat-contact][data-chat-role='admin']");
    if (!contactButton) return;
    selectedChatContactId = Number(contactButton.dataset.chatContact);
    try {
        await loadInternalContacts("admin");
    } catch (error) {
        showInternalInboxNotice("admin", error.message || "Unable to open this conversation.", true);
    }
});

lawyerDashboard?.addEventListener("click", async (event) => {
    const contactButton = event.target.closest("[data-chat-contact][data-chat-role='lawyer']");
    if (!contactButton) return;
    selectedChatContactId = Number(contactButton.dataset.chatContact);
    try {
        await loadInternalContacts("lawyer");
    } catch (error) {
        showInternalInboxNotice("lawyer", error.message || "Unable to open this conversation.", true);
    }
});

document.getElementById("lawyerOpenInboxButton")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    document.getElementById("lawyerInternalInbox").hidden = false;
    document.querySelector(".lawyer-content").classList.remove("inbox-collapsed");
    button.setAttribute("aria-expanded", "true");
    button.hidden = true;
    document.querySelector('[data-chat-refresh="lawyer"]').hidden = false;
    document.getElementById("lawyerCloseInboxButton").hidden = false;
    document.getElementById("lawyerInboxPanel").classList.remove("inbox-collapsed");
    openInternalInbox("lawyer");
});

document.getElementById("lawyerCloseInboxButton")?.addEventListener("click", () => {
    stopInternalInboxPolling();
    selectedChatContactId = null;
    document.getElementById("lawyerInternalInbox").hidden = true;
    document.getElementById("lawyerOpenInboxButton").hidden = false;
    document.getElementById("lawyerOpenInboxButton").setAttribute("aria-expanded", "false");
    document.querySelector('[data-chat-refresh="lawyer"]').hidden = true;
    document.getElementById("lawyerCloseInboxButton").hidden = true;
    document.getElementById("lawyerInboxPanel").classList.add("inbox-collapsed");
    document.querySelector(".lawyer-content").classList.add("inbox-collapsed");
});

["admin", "lawyer"].forEach((role) => {
    const elements = internalInboxElements(role);
    elements.form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = elements.input.value.trim();
        const submitButton = elements.form.querySelector("button[type='submit']");
        if (!selectedChatContactId || !message) return;
        submitButton.disabled = true;
        try {
            await apiRequest(`/internal-messages/${selectedChatContactId}`, {
                method: "POST",
                body: JSON.stringify({ message })
            });
            elements.input.value = "";
            await loadInternalContacts(role);
        } catch (error) {
            console.error("Unable to send internal message:", error);
            showInternalInboxNotice(role, error.message || "Unable to send your message.", true);
        } finally {
            submitButton.disabled = !selectedChatContactId;
            elements.input.focus();
        }
    });

    document.querySelector(`[data-chat-refresh="${role}"]`)?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            await loadInternalContacts(role);
            showInternalInboxNotice(role, "Inbox refreshed.");
        } catch (error) {
            showInternalInboxNotice(role, error.message || "Unable to refresh your inbox.", true);
        } finally {
            button.disabled = false;
        }
    });
});

function openLawyerDialog(lawyer = null) {
    const dialog = document.getElementById("lawyerDialog");
    document.getElementById("lawyerForm").reset();
    document.getElementById("lawyerId").value = lawyer?.id || "";
    document.getElementById("lawyerDialogTitle").textContent = lawyer ? "Edit lawyer" : "Add lawyer";
    document.getElementById("lawyerName").value = lawyer?.name || "";
    document.getElementById("lawyerTitle").value = lawyer?.title || "";
    document.getElementById("lawyerPracticeAreas").value = lawyer?.practiceAreas || "";
    document.getElementById("lawyerEmail").value = lawyer?.email || "";
    document.getElementById("lawyerPhone").value = lawyer?.phone || "";
    document.getElementById("lawyerBio").value = lawyer?.bio || "";
    document.getElementById("lawyerUserId").value = lawyer?.user_id || "";
    document.getElementById("lawyerAccountLinkField").hidden = !lawyer;
    document.getElementById("lawyerEmail").required = !lawyer;
    dialog.showModal();
}

document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.addEventListener("click", () => showAdminView(button.dataset.adminView));
});
document.querySelectorAll("[data-admin-go]").forEach((button) => {
    button.addEventListener("click", () => showAdminView(button.dataset.adminGo));
});
document.querySelectorAll("[data-admin-refresh]").forEach((button) => {
    button.addEventListener("click", async () => {
        const label = button.textContent;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.textContent = "Refreshing...";

        try {
            if (await loadAdminDashboard()) {
                setNotice("Dashboard data refreshed.");
            }
        } catch (error) {
            console.error("Unable to refresh admin dashboard:", error);
            setNotice(error.message || "Unable to refresh dashboard data.", true);
        } finally {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            button.textContent = label;
        }
    });
});
document.querySelectorAll("[data-admin-activity-refresh]").forEach((button) => {
    button.addEventListener("click", async () => {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        try {
            await loadAdminActivity();
            setNotice("Recent activity refreshed.");
        } catch (error) {
            console.error("Unable to refresh recent activity:", error);
            setNotice(error.message || "Unable to refresh recent activity.", true);
        } finally {
            button.disabled = false;
            button.removeAttribute("aria-busy");
        }
    });
});
document.querySelectorAll("[data-admin-mark-all-read]").forEach((button) => {
    button.addEventListener("click", async () => {
        const items = [...document.querySelectorAll("#activityList .activity-item.is-unread")];
        if (!items.length) {
            setNotice("There is no unread activity to mark.");
            return;
        }

        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        try {
            await apiRequest("/admin/activity/read-all", { method: "POST" });
            await loadAdminActivity();
            setNotice("All recent activity marked as read.");
        } catch (error) {
            console.error("Unable to mark all activity as read:", error);
            setNotice(error.message || "Unable to mark all activity as read.", true);
        } finally {
            button.disabled = false;
            button.removeAttribute("aria-busy");
        }
    });
});

document.getElementById("addLawyerButton")?.addEventListener("click", () => openLawyerDialog());
document.getElementById("adminOpenInboxButton")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const inbox = document.getElementById("adminInternalInbox");
    const refreshButton = document.querySelector('[data-chat-refresh="admin"]');
    const closeButton = document.getElementById("adminCloseInboxButton");
    inbox.hidden = false;
    document.querySelector(".admin-content").classList.remove("admin-inbox-collapsed");
    button.setAttribute("aria-expanded", "true");
    button.hidden = true;
    refreshButton.hidden = false;
    closeButton.hidden = false;
    openInternalInbox("admin");
});
document.getElementById("adminCloseInboxButton")?.addEventListener("click", () => {
    stopInternalInboxPolling();
    selectedChatContactId = null;
    document.getElementById("adminInternalInbox").hidden = true;
    document.getElementById("adminOpenInboxButton").hidden = false;
    document.getElementById("adminOpenInboxButton").setAttribute("aria-expanded", "false");
    document.querySelector('[data-chat-refresh="admin"]').hidden = true;
    document.getElementById("adminCloseInboxButton").hidden = true;
    document.querySelector(".admin-content").classList.add("admin-inbox-collapsed");
});
document.getElementById("closeLawyerDialog")?.addEventListener("click", () => document.getElementById("lawyerDialog").close());
document.getElementById("cancelLawyerDialog")?.addEventListener("click", () => document.getElementById("lawyerDialog").close());
document.getElementById("closeTemporaryPasswordDialog")?.addEventListener("click", () => {
    document.getElementById("temporaryPasswordDialog").close();
    document.getElementById("temporaryAccountEmail").value = "";
    document.getElementById("temporaryPasswordValue").value = "";
    document.getElementById("temporaryPasswordCopyStatus").textContent = "";
});

document.getElementById("copyTemporaryPassword")?.addEventListener("click", async () => {
    const passwordInput = document.getElementById("temporaryPasswordValue");
    const copyStatus = document.getElementById("temporaryPasswordCopyStatus");
    passwordInput.select();
    try {
        await navigator.clipboard.writeText(passwordInput.value);
        copyStatus.textContent = "Password copied. Share the login details securely.";
    } catch {
        copyStatus.textContent = "Clipboard access is unavailable. Select and copy the password manually.";
    }
});

document.getElementById("requiredPasswordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passwordInput = document.getElementById("newLawyerPassword");
    const confirmInput = document.getElementById("confirmLawyerPassword");
    const errorMessage = document.getElementById("requiredPasswordError");
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    if (passwordInput.value !== confirmInput.value) {
        errorMessage.textContent = "The passwords do not match.";
        return;
    }

    submitButton.disabled = true;
    errorMessage.textContent = "";
    try {
        const result = await apiRequest("/auth/change-temporary-password", {
            method: "POST",
            body: JSON.stringify({ newPassword: passwordInput.value })
        });
        localStorage.setItem("token", result.token);
        localStorage.setItem("user", JSON.stringify(result.user));
        window.location.reload();
    } catch (error) {
        errorMessage.textContent = error.message || "Unable to change your password.";
        submitButton.disabled = false;
    }
});

document.getElementById("lawyerForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.getElementById("lawyerId").value;
    const body = {
        name: document.getElementById("lawyerName").value.trim(),
        title: document.getElementById("lawyerTitle").value.trim(),
        practiceAreas: document.getElementById("lawyerPracticeAreas").value.trim(),
        email: document.getElementById("lawyerEmail").value.trim(),
        phone: document.getElementById("lawyerPhone").value.trim(),
        bio: document.getElementById("lawyerBio").value.trim(),
        userId: id ? document.getElementById("lawyerUserId").value || null : null
    };
    try {
        const result = await apiRequest(id ? `/lawyers/admin/${id}` : "/lawyers/admin", {
            method: id ? "PATCH" : "POST",
            body: JSON.stringify(body)
        });
        document.getElementById("lawyerDialog").close();
        if (!id) {
            document.getElementById("temporaryAccountEmail").value = result.accountEmail;
            document.getElementById("temporaryPasswordValue").value = result.temporaryPassword;
            document.getElementById("temporaryPasswordCopyStatus").textContent = "";
            document.getElementById("temporaryPasswordDialog").showModal();
            await loadAdminUsers();
        }
        setNotice(id ? "Lawyer profile saved." : "Lawyer profile and login created. Share the temporary password securely.");
        await Promise.all([loadAdminLawyers(), loadAdminConsultations(), loadAdminStats()]);
    } catch (error) {
        setNotice(error.message, true);
    }
});

adminDashboard?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;

    try {
        if (action === "mark-activity-read") {
            const type = button.dataset.type;
            button.disabled = true;
            await apiRequest("/admin/activity/read", {
                method: "POST",
                body: JSON.stringify({ activity: [{ type, id: Number(id) }] })
            });
            adminDashboard.querySelectorAll("[data-activity-key]").forEach((item) => {
                if (item.dataset.activityKey !== `${type}-${id}`) return;
                item.classList.remove("is-unread");
                item.classList.add("is-read");
                const metadata = item.querySelector("small");
                if (metadata) metadata.textContent = metadata.textContent.replace("Unread", "Read");
                item.querySelector('[data-action="mark-activity-read"]')?.remove();
            });
            setNotice("Activity marked as read. Refresh activity to remove it.");
        } else if (action === "edit-lawyer") {
            const lawyer = adminLawyers.find((item) => String(item.id) === id);
            if (lawyer) openLawyerDialog(lawyer);
        } else if (action === "reset-lawyer-password") {
            const lawyer = adminLawyers.find((item) => String(item.id) === id);
            if (!lawyer?.user_id) {
                setNotice("No login account is linked to this lawyer.", true);
                return;
            }
            if (!window.confirm(`Generate a new temporary password for ${lawyer.name}? Their current password and active sessions will stop working.`)) return;
            button.disabled = true;
            const result = await apiRequest(`/lawyers/admin/${id}/temporary-password`, { method: "POST" });
            document.getElementById("temporaryAccountEmail").value = result.accountEmail;
            document.getElementById("temporaryPasswordValue").value = result.temporaryPassword;
            document.getElementById("temporaryPasswordCopyStatus").textContent = "";
            document.getElementById("temporaryPasswordDialog").showModal();
            setNotice(`Temporary password created for ${lawyer.name}. Share the login details securely.`);
        } else if (action === "remove-lawyer") {
            if (!window.confirm("Remove this lawyer from the public directory? Existing consultations will remain in the records.")) return;
            await apiRequest(`/lawyers/admin/${id}`, { method: "DELETE" });
            setNotice("Lawyer profile removed from the public directory.");
            await Promise.all([loadAdminLawyers(), loadAdminConsultations(), loadAdminStats()]);
        } else if (action === "delete-message") {
            if (!window.confirm("Permanently delete this contact message?")) return;
            await apiRequest(`/messages/${id}`, { method: "DELETE" });
            setNotice("Contact message deleted.");
            await Promise.all([loadAdminMessages(), loadAdminStats()]);
        }
    } catch (error) {
        if (action === "mark-activity-read" || action === "reset-lawyer-password") button.disabled = false;
        setNotice(error.message, true);
    }
});

adminDashboard?.addEventListener("change", async (event) => {
    const control = event.target.closest("[data-action]");
    if (!control) return;
    const { action, id } = control.dataset;
    const newValue = control.value;
    if (!newValue) return;

    try {
        if (action === "assign-consultation") {
            await apiRequest(`/consultations/${id}/assign`, {
                method: "PATCH",
                body: JSON.stringify({ lawyerId: Number(newValue) })
            });
            setNotice("Consultation assigned.");
        } else if (action === "change-status") {
            await apiRequest(`/consultations/${id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status: newValue })
            });
            setNotice("Consultation status updated.");
        }
        await Promise.all([loadAdminConsultations(), loadAdminStats(), loadAdminActivity()]);
    } catch (error) {
        setNotice(error.message, true);
        await loadAdminConsultations();
    }
});

async function loadLawyerDashboard() {
    try {
        setLawyerNotice("");
        const dashboard = await apiRequest("/lawyers/dashboard");
        const { profile, stats, consultations } = dashboard;

        document.getElementById("lawyerSidebarName").textContent = profile.accountName;
        document.getElementById("lawyerSidebarEmail").textContent =
            profile.accountEmail;
        document.getElementById("lawyerProfileName").textContent = profile.accountName;
        document.getElementById("lawyerProfileTitle").textContent = profile.title;
        document.getElementById("lawyerProfileSpecialization").textContent = profile.practiceAreas;
        document.getElementById("lawyerProfileContact").textContent =
            [profile.accountEmail, profile.accountPhone || profile.phone].filter(Boolean).join(" · ")
            || "Contact details not provided";
        document.getElementById("lawyerConsultations").textContent = Number(stats.totalConsultations || 0);
        document.getElementById("lawyerPending").textContent = Number(stats.pendingConsultations || 0);
        document.getElementById("lawyerApproved").textContent = Number(stats.approvedConsultations || 0);
        document.getElementById("lawyerCompleted").textContent = Number(stats.completedConsultations || 0);
        document.getElementById("lawyerAppointments").textContent = Number(stats.upcomingAppointments || 0);
        document.getElementById("lawyerClients").textContent = Number(stats.totalClients || 0);

        renderLawyerConsultations(consultations);
        renderLawyerClients(consultations);
        renderLawyerAppointments(dashboard.upcomingAppointments || []);
        renderRecentLawyerConsultations(dashboard.recentConsultations || []);
    } catch (error) {
        console.error("Unable to load lawyer dashboard:", error);
        setLawyerNotice(error.message || "Unable to load your dashboard. Please refresh and try again.", true);
    }
}

function setLawyerNotice(message, isError = false) {
    const notice = document.getElementById("lawyerNotice");
    if (!notice) return;
    notice.textContent = message;
    notice.className = `lawyer-notice${isError ? " error" : ""}`;
    notice.hidden = !message;
}

function lawyerStatusClass(status) {
    return `lawyer-status status-${String(status || "pending").toLowerCase()}`;
}

function formatAppointment(appointmentAt, preferredDate) {
    if (appointmentAt) {
        const date = new Date(appointmentAt);
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleString(undefined, {
                year: "numeric", month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit"
            });
        }
    }
    return preferredDate ? `${formatDate(preferredDate)} · Time not set` : "Not scheduled";
}

function renderLawyerConsultations(consultations) {
    const rows = consultations.map((item) => `
        <tr>
            <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.client_email || "")}</small><small>${escapeHtml(item.client_phone || "No phone provided")}</small></td>
            <td><strong>${escapeHtml(item.service)}</strong><span class="lawyer-request-message">${escapeHtml(item.message)}</span></td>
            <td>${escapeHtml(formatAppointment(item.appointment_at, item.preferred_date))}</td>
            <td><span class="${lawyerStatusClass(item.status)}">${escapeHtml(formatRole(item.status))}</span></td>
            <td>
                <div class="lawyer-action-group">
                    ${item.status === "pending" ? `<label class="lawyer-appointment-input">Set appointment time<input type="datetime-local" data-lawyer-appointment="${item.id}" aria-label="Appointment time for ${escapeHtml(item.name)}"></label>` : ""}
                    ${item.status === "pending" ? `<button class="lawyer-action approve" type="button" data-lawyer-action="approved" data-id="${item.id}">Approve</button>` : ""}
                    ${["pending", "approved", "scheduled"].includes(item.status) ? `<button class="lawyer-action complete" type="button" data-lawyer-action="completed" data-id="${item.id}">Complete</button>` : ""}
                    ${["pending", "approved", "scheduled"].includes(item.status) ? `<button class="lawyer-action reject" type="button" data-lawyer-action="rejected" data-id="${item.id}">Reject</button><button class="lawyer-action cancel" type="button" data-lawyer-action="cancelled" data-id="${item.id}">Cancel</button>` : ""}
                </div>
            </td>
        </tr>`).join("");
    document.getElementById("lawyerConsultationList").innerHTML =
        rows || '<tr><td colspan="5" class="empty-state">No consultations have been assigned to you.</td></tr>';
}

function renderLawyerClients(consultations) {
    const clients = new Map();
    consultations.forEach((item) => {
        const client = clients.get(item.client_id) || {
            name: item.name,
            email: item.client_email,
            phone: item.client_phone,
            matters: 0
        };
        client.matters += 1;
        clients.set(item.client_id, client);
    });
    const rows = Array.from(clients.values()).map((client) => `
        <tr>
            <td><strong>${escapeHtml(client.name)}</strong></td>
            <td>${escapeHtml(client.email || "—")}</td>
            <td>${escapeHtml(client.phone || "—")}</td>
            <td>${client.matters}</td>
        </tr>`).join("");
    document.getElementById("lawyerClientList").innerHTML =
        rows || '<tr><td colspan="4" class="empty-state">No clients are assigned to you yet.</td></tr>';
}

function renderLawyerAppointments(appointments) {
    const cards = appointments.map((item) => `
        <article class="lawyer-appointment-card">
            <div><span class="lawyer-eyebrow">APPOINTMENT</span><strong>${escapeHtml(formatAppointment(item.appointment_at, item.preferred_date))}</strong></div>
            <div><span class="lawyer-eyebrow">CLIENT</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.service)}</small></div>
            <span class="${lawyerStatusClass(item.status)}">${escapeHtml(formatRole(item.status))}</span>
        </article>`).join("");
    document.getElementById("lawyerAppointmentsList").innerHTML =
        cards || '<p class="empty-state">No upcoming appointments have been scheduled.</p>';
}

function renderRecentLawyerConsultations(consultations) {
    const items = consultations.map((item) => `
        <article class="lawyer-recent-item">
            <span class="lawyer-recent-mark" aria-hidden="true"></span>
            <div><strong>${escapeHtml(item.name)} · ${escapeHtml(item.service)}</strong>
            <p>${escapeHtml(item.message)}</p>
            <small>${formatDate(item.created_at)} · <span class="${lawyerStatusClass(item.status)}">${escapeHtml(formatRole(item.status))}</span></small></div>
        </article>`).join("");
    document.getElementById("lawyerRecentList").innerHTML =
        items || '<p class="empty-state">No recent consultations.</p>';
}

document.querySelectorAll("[data-lawyer-target]").forEach((button) => {
    button.addEventListener("click", () => {
        showDashboardPanel(
            ".lawyer-panel-section",
            ".lawyer-nav-link",
            button.dataset.lawyerTarget,
            button
        );
        if (button.dataset.lawyerTarget === "lawyerInboxPanel") {
            const inbox = document.getElementById("lawyerInternalInbox");
            inbox.hidden = true;
            const openButton = document.getElementById("lawyerOpenInboxButton");
            openButton.hidden = false;
            openButton.setAttribute("aria-expanded", "false");
            document.querySelector('[data-chat-refresh="lawyer"]').hidden = true;
            document.getElementById("lawyerCloseInboxButton").hidden = true;
            document.getElementById("lawyerInboxPanel").classList.add("inbox-collapsed");
            document.querySelector(".lawyer-content").classList.add("inbox-collapsed");
            if (activeInternalInbox === "lawyer") stopInternalInboxPolling();
        } else if (activeInternalInbox === "lawyer") {
            stopInternalInboxPolling();
        }
        if (button.dataset.lawyerTarget !== "lawyerInboxPanel") {
            document.querySelector(".lawyer-content").classList.remove("inbox-collapsed");
        }
    });
});

lawyerDashboard?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-lawyer-action]");
    if (!button) return;
    const { id, lawyerAction } = button.dataset;
    const appointmentInput = document.querySelector(`[data-lawyer-appointment="${id}"]`);
    const appointmentAt = lawyerAction === "approved"
        ? appointmentInput?.value || null
        : null;

    if (lawyerAction === "approved" && !appointmentAt
        && !window.confirm("Approve this consultation without setting an appointment date and time?")) {
        return;
    }
    if (lawyerAction === "rejected" && !window.confirm("Reject this consultation request?")) {
        return;
    }
    if (lawyerAction === "cancelled" && !window.confirm("Cancel this consultation?")) {
        return;
    }

    button.disabled = true;
    try {
        await apiRequest(`/consultations/${id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status: lawyerAction, appointmentAt })
        });
        setLawyerNotice(`Consultation ${lawyerAction}.`);
        await loadLawyerDashboard();
    } catch (error) {
        setLawyerNotice(error.message || "Unable to update consultation.", true);
        button.disabled = false;
    }
});

async function loadClientDashboard() {
    try {
        const [dashboard, consultations] = await Promise.all([
            apiRequest("/clients/dashboard"),
            apiRequest("/consultations/my")
        ]);
        const account = dashboard.account;
        const stats = dashboard.stats;

        document.getElementById("clientSidebarName").textContent = account.name;
        document.getElementById("clientSidebarEmail").textContent = account.email;
        document.getElementById("clientAccountName").textContent = account.name;
        document.getElementById("clientAccountEmail").textContent = account.email;
        document.getElementById("clientAccountPhone").textContent = account.phone || "No phone number on file";
        document.getElementById("clientConsultations").textContent = Number(stats.totalConsultations || 0);
        document.getElementById("clientPending").textContent = Number(stats.pendingConsultations || 0);
        document.getElementById("clientApproved").textContent = Number(stats.approvedConsultations || 0);
        document.getElementById("clientCompleted").textContent = Number(stats.completedConsultations || 0);
        document.getElementById("clientAppointments").textContent = Number(stats.upcomingAppointments || 0);

        renderClientConsultations(consultations);
        renderClientAppointments(dashboard.appointments || []);
        renderClientUpdates(dashboard.updates || []);
    } catch (error) {
        console.error("Unable to load client dashboard:", error);
        setClientNotice(error.message || "Unable to load your dashboard. Please refresh and try again.", true);
    }
}

function setClientNotice(message, isError = false) {
    const notice = document.getElementById("clientNotice");
    if (!notice) return;
    notice.textContent = message;
    notice.className = `client-notice${isError ? " error" : ""}`;
    notice.hidden = !message;
}

function statusClass(status) {
    return `client-status status-${String(status || "pending").toLowerCase()}`;
}

function renderClientConsultations(consultations) {
    const body = document.getElementById("clientConsultationList");
    const rows = consultations.map((item) => `
        <tr>
            <td><strong>${escapeHtml(item.service)}</strong><span class="client-request-summary">${escapeHtml(item.message)}</span></td>
            <td>${escapeHtml(item.lawyer_name || "Not assigned yet")}</td>
            <td>${escapeHtml(formatAppointment(item.appointment_at, item.preferred_date))}</td>
            <td>${formatDate(item.created_at)}</td>
            <td><span class="${statusClass(item.status)}">${escapeHtml(formatRole(item.status))}</span></td>
        </tr>`).join("");
    body.innerHTML = rows || '<tr><td colspan="5" class="empty-state">No consultation requests yet. Use the form below when you are ready.</td></tr>';
}

function renderClientAppointments(appointments) {
    const list = document.getElementById("clientAppointmentsList");
    const cards = appointments.map((item) => `
        <article class="client-appointment-card">
            <div class="appointment-date"><strong>${escapeHtml(formatAppointment(item.appointment_at, item.preferred_date))}</strong><span>${escapeHtml(item.service)}</span></div>
            <div class="appointment-detail"><span>LAWYER</span><strong>${escapeHtml(item.lawyer_name || "The firm will assign a lawyer")}</strong></div>
            <span class="${statusClass(item.status)}">${escapeHtml(formatRole(item.status))}</span>
        </article>`).join("");
    list.innerHTML = cards || '<p class="empty-state">You have no upcoming appointments. A preferred date becomes an appointment once the firm schedules it.</p>';
}

function renderClientUpdates(updates) {
    const list = document.getElementById("clientUpdatesList");
    const items = updates.map((item) => `
        <article class="client-update-item">
            <span class="activity-mark" aria-hidden="true"></span>
            <div><strong>${escapeHtml(item.service)} request updated</strong>
            <p>Status: ${escapeHtml(formatRole(item.status))}${item.lawyerName ? ` · Lawyer: ${escapeHtml(item.lawyerName)}` : ""}</p>
            <small>${formatDate(item.updatedAt)}</small></div>
        </article>`).join("");
    list.innerHTML = items || '<p class="empty-state">Updates from the firm about your consultation requests will appear here.</p>';
}

document.querySelectorAll("[data-client-target]").forEach((button) => {
    button.addEventListener("click", () => {
        showDashboardPanel(
            ".client-panel-section",
            ".client-nav-link",
            button.dataset.clientTarget,
            button
        );
    });
});

function showDashboardPanel(panelSelector, linkSelector, targetId, activeLink) {
    const target = document.getElementById(targetId);
    if (!target) return;

    document.querySelectorAll(panelSelector).forEach((panel) => {
        panel.hidden = panel !== target;
    });
    document.querySelectorAll(linkSelector).forEach((link) => {
        const isActive = link === activeLink;
        link.classList.toggle("active", isActive);
        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

document.getElementById("clientConsultationForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector("button[type='submit']");
    const body = {
        service: document.getElementById("consultationService").value,
        preferredDate: document.getElementById("preferredDate").value || null,
        message: document.getElementById("consultationMessage").value.trim()
    };

    submitButton.disabled = true;
    setClientNotice("Submitting your consultation request...");
    try {
        await apiRequest("/consultations", {
            method: "POST",
            body: JSON.stringify(body)
        });
        form.reset();
        setClientNotice("Your request has been submitted. You can follow its status in consultation history.");
        await loadClientDashboard();
    } catch (error) {
        setClientNotice(error.message || "Unable to submit your request. Please try again.", true);
    } finally {
        submitButton.disabled = false;
    }
});

logoutButton?.addEventListener("click", function () {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "login.html";
});
