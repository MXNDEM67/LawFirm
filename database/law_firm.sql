CREATE DATABASE IF NOT EXISTS law_firm
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE law_firm;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL,
    phone VARCHAR(40) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'lawyer', 'client') NOT NULL DEFAULT 'client',
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    password_version INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lawyers (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NULL,
    name VARCHAR(120) NOT NULL,
    title VARCHAR(120) NOT NULL,
    practice_areas VARCHAR(255) NOT NULL,
    bio TEXT NULL,
    email VARCHAR(190) NULL,
    phone VARCHAR(40) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_lawyers_user (user_id),
    CONSTRAINT fk_lawyers_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS consultations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id INT UNSIGNED NOT NULL,
    lawyer_id INT UNSIGNED NULL,
    service VARCHAR(120) NOT NULL,
    message TEXT NOT NULL,
    preferred_date DATE NULL,
    appointment_at DATETIME NULL,
    status ENUM('pending', 'approved', 'scheduled', 'completed', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_consultations_client (client_id),
    KEY idx_consultations_lawyer (lawyer_id),
    KEY idx_consultations_status (status),
    CONSTRAINT fk_consultations_client FOREIGN KEY (client_id) REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_consultations_lawyer FOREIGN KEY (lawyer_id) REFERENCES lawyers (id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    service VARCHAR(120) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_messages_created_at (created_at)
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS admin_activity_reads (
    user_id INT UNSIGNED NOT NULL,
    event_type ENUM('consultation', 'user', 'message', 'lawyer') NOT NULL,
    event_id INT UNSIGNED NOT NULL,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, event_type, event_id),
    CONSTRAINT fk_admin_activity_reads_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO lawyers (name, title, practice_areas, bio) VALUES
    ('John Mensah', 'Managing Partner', 'Corporate & Commercial', 'Focuses on corporate and commercial matters, business agreements, company issues, and commercial relationships.'),
    ('Sarah Asante', 'Senior Associate', 'Family & Property', 'Works on family and property matters, helping clients understand processes, documents, and practical options.'),
    ('Michael Owusu', 'Associate Lawyer', 'Litigation & Criminal', 'Focuses on litigation and criminal law, proceedings, procedural steps, and legal disputes.'),
    ('Amara Boateng', 'Senior Associate', 'Employment Law', 'Advises on workplace concerns, employment terms, and employer and employee responsibilities.'),
    ('Kwame Addo', 'Associate Lawyer', 'Property & Land', 'Works on property and land transactions, ownership questions, and property-related disagreements.'),
    ('Efua Owusu', 'Associate Lawyer', 'Family Law', 'Works with clients on family-related matters and explains relevant processes and available options.');
