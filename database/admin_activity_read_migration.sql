USE law_firm;

CREATE TABLE IF NOT EXISTS admin_activity_reads (
    user_id INT UNSIGNED NOT NULL,
    event_type ENUM('consultation', 'user', 'message', 'lawyer') NOT NULL,
    event_id INT UNSIGNED NOT NULL,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, event_type, event_id),
    CONSTRAINT fk_admin_activity_reads_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB;
