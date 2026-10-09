USE law_firm;

CREATE TABLE IF NOT EXISTS internal_messages (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    sender_id INT UNSIGNED NOT NULL,
    recipient_id INT UNSIGNED NOT NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_internal_messages_pair (sender_id, recipient_id, id),
    KEY idx_internal_messages_unread (recipient_id, sender_id, read_at),
    CONSTRAINT fk_internal_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_internal_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB;
