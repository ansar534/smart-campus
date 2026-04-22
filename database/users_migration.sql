-- ============================================
-- Users table for authentication
-- Run this ONCE against your existing smartcamsuseventdb database.
-- ============================================
USE smartcampuseventdb;

CREATE TABLE IF NOT EXISTS Users (
    user_id         INT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('student','faculty','admin') NOT NULL,
    linked_id       INT NULL,
    active          TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
