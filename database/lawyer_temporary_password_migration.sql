USE law_firm;

ALTER TABLE users
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN password_version INT UNSIGNED NOT NULL DEFAULT 0;
