# Law Firm Website Backend

This project uses a plain HTML/CSS/JavaScript frontend and a Node.js/Express API backed by MySQL. The API listens on port `5000`.

## Requirements

- Node.js 18 or newer
- MySQL 8 or newer

## Set up the database

From the project folder, create the database and tables by importing the SQL file:

```powershell
cmd /c "mysql -u root -p < database\law_firm.sql"
```

The SQL file creates the `law_firm` database and adds the six public lawyer profiles used by the website. If your MySQL username or password is different, adjust the command accordingly.

If you already created the database before enabling lawyer appointment scheduling, run this one-time schema migration in MySQL:

```powershell
cmd /c "mysql -u root -p law_firm < database\lawyer_dashboard_migration.sql"
```

If you already created the database before enabling per-admin recent activity read status, run this one-time migration:

```powershell
cmd /c "mysql -u root -p law_firm < database\admin_activity_read_migration.sql"
```

If you already created the database before enabling private admin-lawyer messaging, run this one-time migration:

```powershell
cmd /c "mysql -u root -p law_firm < database\internal_messaging_migration.sql"
```

If you already created the database before enabling temporary lawyer passwords, run this one-time migration:

```powershell
cmd /c "mysql -u root -p law_firm < database\lawyer_temporary_password_migration.sql"
```

## Configure and start the API

Copy the example environment file and set the MySQL credentials and a private JWT secret:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET`. `DB_PASSWORD` can be empty for a local MySQL installation that has no password. Use a long, random value for `JWT_SECRET` and do not share or commit `.env`.

Install dependencies and run the server:

```powershell
npm install
npm start
```

Visit `http://localhost:5000/api/health` to check the API and database connection. The frontend currently calls the API at `http://localhost:5000`.

## Accounts and roles

`POST /api/auth/register` creates a client account. The submitted password is hashed with bcrypt before it is stored. Registration never accepts a role, so a visitor cannot create an admin or lawyer account.

To have the server create an administrator automatically, set both `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. The backend hashes the password with bcrypt and ensures that account has the admin role before accepting requests. The configured password is reapplied at each server start, so treat `.env` as the source of truth and keep it private. If either variable is blank, automatic administrator setup is skipped.

The requested local admin credentials are set in `.env` for this workspace. Change them before using the site anywhere public or shared.

To add a lawyer who can sign in and be assigned consultations, use **Add lawyer** in the admin dashboard and enter their email. The backend creates the lawyer account and profile together, generates a temporary password, and displays the login details once. The lawyer must change the password after their first sign-in.

To link a pre-existing lawyer account to an existing profile, use the profile's `id` from `SELECT id, name FROM lawyers;`:

```sql
UPDATE lawyers
SET user_id = (SELECT id FROM users WHERE email = 'lawyer@example.com')
WHERE id = 1;
```

Keep admin and lawyer account creation restricted to trusted staff. Existing tokens contain the role assigned at login, so sign in again after changing a user's role.

## API routes

Protected routes require the header `Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a client; returns `{ token, user }` |
| `POST` | `/api/auth/login` | Public | Sign in; returns `{ token, user }` |
| `POST` | `/api/auth/change-temporary-password` | Lawyer with temporary-password token | Set a new password before accessing protected lawyer features |
| `GET` | `/api/lawyers` | Public | List active lawyer profiles |
| `GET` | `/api/lawyers/:id` | Public | Get one active lawyer profile |
| `GET` | `/api/consultations` | Signed in | Admins see all; lawyers see assigned; clients see their own |
| `GET` | `/api/consultations/my` | Signed in | Return consultations scoped to the signed-in client or lawyer |
| `POST` | `/api/consultations` | Client | Create a consultation using `service`, `message`, and optional `preferredDate` |
| `PATCH` | `/api/consultations/:id/assign` | Admin | Assign `lawyerId` (the lawyer profile ID) |
| `PATCH` | `/api/consultations/:id/status` | Admin or assigned lawyer | Set `status` to `pending`, `approved`, `scheduled`, `completed`, `rejected`, or `cancelled` |
| `POST` | `/api/messages` | Public | Save the existing contact form fields: `name`, `email`, `phone`, `service`, `message` |
| `GET` | `/api/messages` | Admin | View contact messages |
| `GET` | `/api/internal-messages/contacts` | Admin or lawyer | List the admins or lawyers available for private conversations |
| `GET` | `/api/internal-messages/:userId` | Admin or lawyer | View the latest 200 messages in a private admin-lawyer conversation |
| `POST` | `/api/internal-messages/:userId` | Admin or lawyer | Send a message of up to 5,000 characters to an admin-lawyer contact |
| `POST` | `/api/internal-messages/:userId/read` | Admin or lawyer | Mark received messages from that contact as read |
| `GET` | `/api/admin/stats` | Admin | View user, lawyer, consultation, pending, and message counts |
| `GET` | `/api/admin/users` | Admin | View user profiles (never password hashes) |
| `GET` | `/api/admin/activity` | Admin | View the 15 most recent account, consultation, contact-message, and lawyer-profile events |
| `POST` | `/api/admin/activity/read` | Admin | Mark up to 15 recent activity events as read for the signed-in admin |
| `GET` | `/api/lawyers/admin` | Admin | View all lawyer profiles, including removed profiles |
| `POST` | `/api/lawyers/admin` | Admin | Create a lawyer profile and login; returns the one-time login email and temporary password |
| `POST` | `/api/lawyers/admin/:id/temporary-password` | Admin | Reset a linked lawyer login to a one-time temporary password |
| `PATCH` | `/api/lawyers/admin/:id` | Admin | Edit a lawyer profile |
| `DELETE` | `/api/lawyers/admin/:id` | Admin | Remove a lawyer from the public directory (soft delete; consultation history is retained) |
| `DELETE` | `/api/messages/:id` | Admin | Delete a contact message |
| `GET` | `/api/lawyers/dashboard` | Lawyer | View the JWT-linked lawyer profile, assigned consultations and clients, statistics, and upcoming appointments |
| `PUT` | `/api/consultations/:id/status` | Assigned lawyer | Approve, complete, reject, or cancel one of the signed-in lawyer's assigned consultations; can set `appointmentAt` as `YYYY-MM-DDTHH:mm` when approving |
| `GET` | `/api/clients/dashboard` | Client | View own account details, consultation totals, upcoming scheduled appointments, and consultation updates |

Admin and lawyer dashboard pages can also use `GET /api/consultations`; its JSON array includes the `name`, `service`, `message`, and `status` fields expected by the current dashboard script. The login and contact routes preserve the existing frontend request and response format.

The lawyer dashboard identifies the lawyer from the JWT and only returns consultations assigned to that account. To schedule an appointment while approving a request, include `appointmentAt` using the local `YYYY-MM-DDTHH:mm` format. Existing databases need the one-time migration above to add appointment time and `approved`/`rejected` consultation statuses.

The client dashboard counts both `approved` and legacy `scheduled` consultation statuses as approved. Its updates list is built from the client's own consultation status/assignment records; the current database does not have a separate law-firm-to-client messaging table.

The contact form is a public enquiry form; it does not create a consultation or establish a lawyer-client relationship.

The internal inbox is separate from public contact enquiries. It supports private, one-to-one messages only between administrator and lawyer accounts, stores conversation history in MySQL, and refreshes an open inbox every six seconds. Existing databases need the `internal_messaging_migration.sql` migration above.

When an admin adds a lawyer, the API creates or links the lawyer login in the same operation, sets a generated temporary password, and returns the login email and temporary password once for secure sharing. Admins can also reset an existing linked lawyer account from the lawyer directory; its new temporary password is displayed once. A lawyer signing in with a temporary password must set a new password before accessing protected dashboard features. Setting or changing a password invalidates previous login sessions. Existing passwords cannot be viewed; passwords remain bcrypt-hashed in the database.
