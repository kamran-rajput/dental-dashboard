-- Client Plane Database Schema DDL Template
-- Standard clean schema for a dedicated client practice database instance.
-- Holds staff logins, bookings, patients, AI activity logs, and practice stats.

CREATE TABLE IF NOT EXISTS staff_logins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    patient_name VARCHAR(255) NOT NULL,
    appointment_date DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'booked',
    service_type VARCHAR(100) NOT NULL,
    source VARCHAR(100) DEFAULT 'AI Receptionist',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    patient_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_calls (
    id SERIAL PRIMARY KEY,
    patient_name VARCHAR(255) NOT NULL,
    call_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INT DEFAULT 0,
    transcript TEXT,
    outcome VARCHAR(100) DEFAULT 'Inquiry',
    call_reason VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS stats (
    id SERIAL PRIMARY KEY,
    period VARCHAR(50) UNIQUE NOT NULL,
    total_calls INT DEFAULT 0,
    booked INT DEFAULT 0,
    cancelled INT DEFAULT 0,
    new_leads INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
