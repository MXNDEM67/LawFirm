USE law_firm;

ALTER TABLE consultations
    MODIFY status ENUM(
        'pending',
        'approved',
        'scheduled',
        'completed',
        'rejected',
        'cancelled'
    ) NOT NULL DEFAULT 'pending',
    ADD COLUMN appointment_at DATETIME NULL AFTER preferred_date;
