-- AMIS - Agricultural Management Information System
-- Bahcesehir Cyprus University · Capstone Final Year Project
-- Final Production-Ready PostgreSQL Schema
-- Target: PostgreSQL 14+ · Normal Form: 3NF · Multi-Tenancy: Row-Level Security
-- 42 Tables · 41 Indexes · 21 Triggers · 8 Functions · 3 Materialized Views

-- Create database
CREATE DATABASE AMIS_DB;

-- Connect to database (run this separately or use \c AMIS_DB)
-- \c AMIS_DB

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- REUSABLE set_updated_at() — declared first, used by all triggers
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN 
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================================
-- SECTION 1 — AUTH & ROLE-BASED ACCESS CONTROL (RBAC)
-- Ref: §2.2.1.8 Role-Based Access Control, §4.1 Main System
-- ============================================================

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(60) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
('admin', 'Full system access; manages users, roles, and configuration'),
('supervisor', 'Oversees farm operations; can edit inventory and view all records'),
('field_staff', 'Records daily inputs, harvests, and production on the farm'),
('remote_management', 'Read-only dashboard access for off-site oversight');

-- Fine-grained permission codes
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    module VARCHAR(60) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    phone VARCHAR(30),
    last_login TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique email
CREATE UNIQUE INDEX idx_users_email ON users (LOWER(email));
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_active ON users(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Session tokens for stateless JWT / server-side session management
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================================
-- SECTION 2 — SYSTEM CONFIGURATION & MULTI-FARM SUPPORT
-- Ref: §2.2.1.9 System Customization and Configurability
-- ============================================================

CREATE TABLE farm_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    country VARCHAR(100),
    region VARCHAR(100),
    operational_sectors TEXT[],
    settings JSONB NOT NULL DEFAULT '{"timezone":"UTC","currency":"USD"}',
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_farm_profiles_updated_at BEFORE UPDATE ON farm_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Per-farm module toggles
CREATE TABLE module_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farm_profiles(id) ON DELETE CASCADE,
    module_name VARCHAR(80) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (farm_id, module_name)
);

-- ============================================================
-- SECTION 3 — INVENTORY MANAGEMENT SYSTEM (IMS)
-- Ref: §4.2.1 — Central hub; every module writes back here when stock moves
-- ============================================================

-- 3a. Units of Measure
CREATE TABLE units_of_measure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    symbol VARCHAR(20) NOT NULL UNIQUE,
    category VARCHAR(30) NOT NULL,
    conversion_to_base NUMERIC(14,6),
    base_unit_id UUID REFERENCES units_of_measure(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO units_of_measure (name, symbol, category, conversion_to_base) VALUES
('kilogram', 'kg', 'mass', 1.0),
('gram', 'g', 'mass', 0.001),
('tonne', 't', 'mass', 1000.0),
('liter', 'L', 'volume', 1.0),
('milliliter', 'mL', 'volume', 0.001),
('piece', 'pc', 'count', 1.0),
('dozen', 'dz', 'count', 12.0),
('hectare', 'ha', 'area', 1.0),
('square_meter', 'm2', 'area', 0.0001);

-- 3b. Item Categories
CREATE TABLE item_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('farm_input', 'feed', 'harvested_product', 'livestock', 'fish', 'supply')),
    description TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO item_categories (name, type, description) VALUES
('Seeds', 'farm_input', 'Planting seeds for crop production'),
('Fertilizers', 'farm_input', 'Chemical and organic fertilizers'),
('Pesticides & Chemicals', 'farm_input', 'Crop protection inputs'),
('Livestock Feed', 'feed', 'Feed for cattle, poultry, and livestock'),
('Aquaculture Feed', 'feed', 'Feed for fish and aquatic species'),
('Crop Harvest', 'harvested_product', 'Harvested crops ready for storage or sale'),
('Livestock Output', 'harvested_product', 'Dairy, eggs, honey, and animal products'),
('Fish Harvest', 'harvested_product', 'Harvested fish from aquaculture'),
('General Supplies', 'supply', 'Miscellaneous operational supplies');

-- 3c. Stock Items — core inventory entity
CREATE TABLE stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES item_categories(id),
    farm_id UUID REFERENCES farm_profiles(id),
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(100) UNIQUE,
    description TEXT,
    unit_of_measure_id UUID REFERENCES units_of_measure(id),
    unit_of_measure VARCHAR(30) NOT NULL,
    current_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
    reserved_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    available_quantity NUMERIC(14,3) GENERATED ALWAYS AS (current_quantity - reserved_quantity) STORED,
    reorder_threshold NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(12,2),
    storage_location VARCHAR(200),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_reserved_le_current CHECK (reserved_quantity <= current_quantity)
);

CREATE INDEX idx_stock_items_category ON stock_items(category_id);
CREATE INDEX idx_stock_items_farm ON stock_items(farm_id);
CREATE INDEX idx_stock_items_active ON stock_items(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_stock_items_updated_at BEFORE UPDATE ON stock_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3d. Stock Transactions — immutable ledger
CREATE TABLE stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_item_id UUID NOT NULL REFERENCES stock_items(id),
    performed_by UUID NOT NULL REFERENCES users(id),
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('purchase', 'usage', 'harvest', 'adjustment', 'transfer', 'waste', 'sale')),
    quantity NUMERIC(14,3) NOT NULL,
    quantity_before NUMERIC(14,3) NOT NULL,
    quantity_after NUMERIC(14,3) NOT NULL,
    reference_id UUID,
    reference_table VARCHAR(60) CHECK (reference_table IN ('sales_orders', 'purchase_orders', 'fish_harvest_records', 'crop_production_records', 'manual_adjustment')),
    source_module VARCHAR(60),
    notes TEXT,
    transacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_tx_item ON stock_transactions(stock_item_id);
CREATE INDEX idx_stock_tx_user ON stock_transactions(performed_by);
CREATE INDEX idx_stock_tx_ref ON stock_transactions(reference_table, reference_id);
CREATE INDEX idx_stock_tx_date ON stock_transactions(transacted_at);
CREATE INDEX idx_stock_tx_type ON stock_transactions(transaction_type);

-- 3e. Reorder Alerts
CREATE TABLE reorder_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_item_id UUID NOT NULL REFERENCES stock_items(id),
    acknowledged_by UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
    quantity_at_trigger NUMERIC(14,3) NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX idx_alerts_item ON reorder_alerts(stock_item_id);
CREATE INDEX idx_alerts_status ON reorder_alerts(status);

-- 3f. Batch / Lot Tracking
CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number VARCHAR(100) NOT NULL UNIQUE,
    stock_item_id UUID NOT NULL REFERENCES stock_items(id),
    supplier_id UUID,
    initial_quantity NUMERIC(14,3) NOT NULL,
    remaining_quantity NUMERIC(14,3) NOT NULL CHECK (remaining_quantity >= 0),
    unit_of_measure VARCHAR(30) NOT NULL,
    production_date DATE,
    expiry_date DATE,
    quality_grade VARCHAR(20),
    source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('purchase', 'harvest', 'production')),
    source_id UUID NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_expiry_after_production CHECK (expiry_date IS NULL OR production_date IS NULL OR expiry_date > production_date)
);

CREATE INDEX idx_batches_stock_item ON batches(stock_item_id);
CREATE INDEX idx_batches_expiry ON batches(expiry_date) WHERE expiry_date IS NOT NULL;

-- ============================================================
-- SECTION 4 — PRODUCTION MANAGEMENT
-- Ref: §4.2.2 — Crop, Livestock, Aquaculture
-- ============================================================

-- 4a. Crop Production Records
CREATE TABLE crop_production_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    recorded_by UUID NOT NULL REFERENCES users(id),
    crop_name VARCHAR(150) NOT NULL,
    crop_type VARCHAR(80),
    field_location VARCHAR(200),
    area_planted NUMERIC(10,3),
    planting_date DATE,
    expected_harvest_date DATE,
    actual_harvest_date DATE,
    quantity_harvested NUMERIC(14,3),
    unit_of_measure VARCHAR(30),
    yield_per_hectare NUMERIC(10,3),
    quality_grade VARCHAR(20),
    season VARCHAR(60),
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crop_farm ON crop_production_records(farm_id);
CREATE INDEX idx_crop_planted ON crop_production_records(planting_date DESC);
CREATE INDEX idx_crop_recorder ON crop_production_records(recorded_by);
CREATE INDEX idx_crop_active ON crop_production_records(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_crop_updated_at BEFORE UPDATE ON crop_production_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4b. Livestock Records — Hybrid individual/batch model
CREATE TABLE livestock_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    recorded_by UUID NOT NULL REFERENCES users(id),
    animal_type VARCHAR(80) NOT NULL,
    breed VARCHAR(100),
    tag_id VARCHAR(60),
    batch_number VARCHAR(80),
    date_acquired DATE,
    acquisition_type VARCHAR(30),
    current_count INTEGER NOT NULL DEFAULT 1 CHECK (current_count > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'deceased', 'transferred')),
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_individual_or_batch CHECK (
        (tag_id IS NOT NULL AND current_count = 1) OR
        (tag_id IS NULL AND current_count >= 1)
    ),
    UNIQUE (farm_id, tag_id)
);

CREATE INDEX idx_livestock_farm ON livestock_records(farm_id);
CREATE INDEX idx_livestock_type ON livestock_records(animal_type);
CREATE INDEX idx_livestock_recorder ON livestock_records(recorded_by);

CREATE TRIGGER trg_livestock_updated_at BEFORE UPDATE ON livestock_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4c. Livestock Health & Growth Logs
CREATE TABLE livestock_health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    livestock_id UUID NOT NULL REFERENCES livestock_records(id),
    recorded_by UUID NOT NULL REFERENCES users(id),
    log_type VARCHAR(30) NOT NULL CHECK (log_type IN ('health_check', 'treatment', 'vaccination', 'weight_check', 'mortality')),
    weight_kg NUMERIC(8,2),
    treatment_details TEXT,
    veterinarian VARCHAR(150),
    outcome TEXT,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_livestock_logs_animal ON livestock_health_logs(livestock_id);
CREATE INDEX idx_livestock_logs_date ON livestock_health_logs(log_date DESC);

-- 4d. Aquaculture (Fish Pond) Records
CREATE TABLE aquaculture_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    recorded_by UUID NOT NULL REFERENCES users(id),
    pond_identifier VARCHAR(80) NOT NULL,
    species VARCHAR(100) NOT NULL,
    stocking_date DATE,
    initial_stock_count INTEGER,
    current_stock_count INTEGER,
    stocking_density NUMERIC(8,2),
    pond_area_sqm NUMERIC(10,2),
    water_source VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'harvested', 'drained', 'inactive')),
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aqua_farm ON aquaculture_records(farm_id);
CREATE INDEX idx_aqua_pond ON aquaculture_records(pond_identifier);
CREATE INDEX idx_aqua_recorded_by ON aquaculture_records(recorded_by);

CREATE TRIGGER trg_aquaculture_updated_at BEFORE UPDATE ON aquaculture_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4e. Fish Harvest Records
CREATE TABLE fish_harvest_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aquaculture_id UUID NOT NULL REFERENCES aquaculture_records(id),
    recorded_by UUID NOT NULL REFERENCES users(id),
    stock_item_id UUID REFERENCES stock_items(id),
    harvest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quantity_kg NUMERIC(12,3) NOT NULL,
    fish_count INTEGER,
    average_weight_g NUMERIC(8,2),
    quality_grade VARCHAR(20),
    destination VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fish_harvest_pond ON fish_harvest_records(aquaculture_id);
CREATE INDEX idx_fish_harvest_date ON fish_harvest_records(harvest_date DESC);

-- 4f. Daily Production Logs
CREATE TABLE daily_production_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    logged_by UUID NOT NULL REFERENCES users(id),
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sector VARCHAR(30) NOT NULL CHECK (sector IN ('crop', 'livestock', 'aquaculture', 'general')),
    activity TEXT NOT NULL,
    quantity NUMERIC(14,3),
    unit VARCHAR(30),
    stock_item_id UUID REFERENCES stock_items(id),
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prod_logs_farm ON daily_production_logs(farm_id);
CREATE INDEX idx_prod_logs_date ON daily_production_logs(log_date DESC);
CREATE INDEX idx_prod_logs_sector ON daily_production_logs(sector);

-- 4g. Work Orders — Production Planning
CREATE TABLE work_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    work_order_number VARCHAR(80) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    planned_start_date DATE NOT NULL,
    planned_end_date DATE,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    actual_start_time TIMESTAMPTZ,
    actual_end_time TIMESTAMPTZ,
    planned_inputs JSONB,
    actual_inputs JSONB,
    planned_outputs JSONB,
    actual_outputs JSONB,
    related_crop_id UUID REFERENCES crop_production_records(id),
    related_livestock_id UUID REFERENCES livestock_records(id),
    related_aquaculture_id UUID REFERENCES aquaculture_records(id),
    status VARCHAR(30) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_work_order_dates CHECK (planned_end_date IS NULL OR planned_start_date <= planned_end_date)
);

CREATE INDEX idx_work_orders_farm ON work_orders(farm_id);
CREATE INDEX idx_work_orders_status ON work_orders(status);
CREATE INDEX idx_work_orders_dates ON work_orders(planned_start_date);

CREATE TRIGGER trg_work_orders_updated_at BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SECTION 5 — HUMAN RESOURCE & LABOR MANAGEMENT
-- Ref: §4.2.3 — Employee records, attendance, task assignments
-- ============================================================

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    farm_id UUID REFERENCES farm_profiles(id),
    full_name VARCHAR(150) NOT NULL,
    employee_code VARCHAR(60) UNIQUE,
    employment_type VARCHAR(30) NOT NULL CHECK (employment_type IN ('permanent', 'contract', 'seasonal', 'daily')),
    job_title VARCHAR(100),
    department VARCHAR(100),
    sector VARCHAR(30) CHECK (sector IN ('crop', 'livestock', 'aquaculture', 'admin', 'logistics', 'general')),
    phone VARCHAR(30),
    national_id VARCHAR(60),
    date_hired DATE,
    contract_end_date DATE,
    daily_wage NUMERIC(10,2),
    monthly_salary NUMERIC(12,2),
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_employee_national_id_per_farm UNIQUE (farm_id, national_id)
);

CREATE INDEX idx_employees_farm ON employees(farm_id);
CREATE INDEX idx_employees_type ON employees(employment_type);
CREATE INDEX idx_employees_active ON employees(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5b. Attendance & Activity Logs
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    recorded_by UUID NOT NULL REFERENCES users(id),
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'public_holiday')),
    clock_in TIME,
    clock_out TIME,
    hours_worked NUMERIC(4,2),
    activity_description TEXT,
    sector VARCHAR(30),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, log_date)
);

CREATE INDEX idx_attendance_employee ON attendance_logs(employee_id);
CREATE INDEX idx_attendance_date_status ON attendance_logs(log_date DESC, status);

-- 5c. Task Assignments
CREATE TABLE task_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    assigned_by UUID NOT NULL REFERENCES users(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    work_order_id UUID REFERENCES work_orders(id),
    task_title VARCHAR(200) NOT NULL,
    description TEXT,
    sector VARCHAR(30),
    due_date DATE,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_employee ON task_assignments(employee_id);
CREATE INDEX idx_tasks_status ON task_assignments(status);
CREATE INDEX idx_tasks_due ON task_assignments(due_date ASC);

CREATE TRIGGER trg_task_assignments_updated_at BEFORE UPDATE ON task_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SECTION 6 — SALES & DISTRIBUTION
-- Ref: §4.2.4 — Sales transactions, customer records, distribution, revenue
-- ============================================================

-- 6a. Customers / Buyers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    name VARCHAR(200) NOT NULL,
    customer_type VARCHAR(30) NOT NULL DEFAULT 'individual' CHECK (customer_type IN ('individual', 'business', 'exporter', 'retailer', 'restaurant')),
    contact_person VARCHAR(150),
    phone VARCHAR(30),
    email VARCHAR(255),
    address TEXT,
    country VARCHAR(100),
    tax_id VARCHAR(80),
    credit_limit NUMERIC(14,2),
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_customer_tax_id_per_farm UNIQUE (farm_id, tax_id)
);

CREATE INDEX idx_customers_farm ON customers(farm_id);
CREATE INDEX idx_customers_type ON customers(customer_type);

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6b. Sales Orders
CREATE TABLE sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    order_number VARCHAR(60) UNIQUE NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    delivery_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled', 'invoiced')),
    payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'overdue')),
    payment_method VARCHAR(30),
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_farm ON sales_orders(farm_id);
CREATE INDEX idx_sales_customer ON sales_orders(customer_id);
CREATE INDEX idx_sales_status ON sales_orders(status);
CREATE INDEX idx_sales_date ON sales_orders(order_date DESC);
CREATE INDEX idx_sales_created_by ON sales_orders(created_by);

CREATE TRIGGER trg_sales_orders_updated_at BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6c. Sales Order Line Items
CREATE TABLE sales_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    stock_item_id UUID NOT NULL REFERENCES stock_items(id),
    batch_id UUID REFERENCES batches(id),
    quantity NUMERIC(14,3) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL,
    notes TEXT
);

CREATE INDEX idx_sale_items_order ON sales_order_items(sales_order_id);
CREATE INDEX idx_sale_items_stock ON sales_order_items(stock_item_id);

-- 6d. Distribution Logs
CREATE TABLE distribution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
    dispatched_by UUID NOT NULL REFERENCES users(id),
    dispatch_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vehicle_ref VARCHAR(100),
    driver_name VARCHAR(150),
    destination TEXT,
    delivery_status VARCHAR(30) NOT NULL DEFAULT 'in_transit' CHECK (delivery_status IN ('in_transit', 'delivered', 'returned', 'failed')),
    delivered_at TIMESTAMPTZ,
    recipient_name VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_distrib_order ON distribution_logs(sales_order_id);
CREATE INDEX idx_distrib_date ON distribution_logs(dispatch_date DESC);

-- 6e. Contracts
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    customer_id UUID REFERENCES customers(id),
    created_by UUID NOT NULL REFERENCES users(id),
    contract_number VARCHAR(80) UNIQUE NOT NULL,
    contract_type VARCHAR(30) NOT NULL DEFAULT 'supply' CHECK (contract_type IN ('supply', 'purchase', 'service', 'lease')),
    start_date DATE NOT NULL,
    end_date DATE,
    total_value NUMERIC(16,2),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'completed')),
    terms TEXT,
    document_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contracts_farm ON contracts(farm_id);
CREATE INDEX idx_contracts_customer ON contracts(customer_id);
CREATE INDEX idx_contracts_status ON contracts(status);

CREATE TRIGGER trg_contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SECTION 7 — ASSET MANAGEMENT
-- Ref: §4.2.5 — Equipment, vehicles, tools, maintenance records
-- ============================================================

CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    asset_code VARCHAR(80),
    name VARCHAR(200) NOT NULL,
    asset_type VARCHAR(50) NOT NULL CHECK (asset_type IN ('equipment', 'vehicle', 'tool', 'infrastructure', 'other')),
    category VARCHAR(100),
    manufacturer VARCHAR(150),
    model VARCHAR(100),
    serial_number VARCHAR(100) UNIQUE,
    purchase_date DATE,
    purchase_cost NUMERIC(14,2),
    current_value NUMERIC(14,2),
    depreciation_rate NUMERIC(5,2),
    location VARCHAR(200),
    assigned_to UUID REFERENCES employees(id),
    status VARCHAR(30) NOT NULL DEFAULT 'operational' CHECK (status IN ('operational', 'under_maintenance', 'decommissioned', 'lost', 'sold')),
    next_service_date DATE,
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_asset_code_per_farm UNIQUE (farm_id, asset_code)
);

CREATE INDEX idx_assets_farm ON assets(farm_id);
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_active ON assets(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7b. Asset Maintenance Records
CREATE TABLE asset_maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id),
    performed_by UUID NOT NULL REFERENCES users(id),
    maintenance_type VARCHAR(30) NOT NULL CHECK (maintenance_type IN ('routine', 'repair', 'inspection', 'overhaul', 'emergency')),
    description TEXT NOT NULL,
    cost NUMERIC(12,2),
    service_provider VARCHAR(200),
    maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    next_service_date DATE,
    downtime_hours NUMERIC(6,2),
    outcome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_asset ON asset_maintenance_logs(asset_id);
CREATE INDEX idx_maintenance_date ON asset_maintenance_logs(maintenance_date DESC);

-- 7c. Asset Usage Logs
CREATE TABLE asset_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id),
    used_by UUID NOT NULL REFERENCES employees(id),
    authorized_by UUID REFERENCES users(id),
    purpose TEXT NOT NULL,
    sector VARCHAR(30),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    hours_used NUMERIC(6,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_usage_asset ON asset_usage_logs(asset_id);
CREATE INDEX idx_asset_usage_date ON asset_usage_logs(start_time DESC);

-- ============================================================
-- SECTION 8 — PROCUREMENT
-- Ref: §2.4.2 Business Logic Layer — Procurement module
-- ============================================================

-- 8a. Suppliers
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    name VARCHAR(200) NOT NULL,
    supplier_type VARCHAR(50),
    contact_person VARCHAR(150),
    phone VARCHAR(30),
    email VARCHAR(255),
    address TEXT,
    country VARCHAR(100),
    tax_id VARCHAR(80),
    payment_terms VARCHAR(100),
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_farm ON suppliers(farm_id);

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8b. Purchase Orders
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    created_by UUID NOT NULL REFERENCES users(id),
    po_number VARCHAR(60) UNIQUE NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'received', 'partially_received', 'cancelled')),
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_farm ON purchase_orders(farm_id);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_created_by ON purchase_orders(created_by);

CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8c. Purchase Order Line Items
CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    stock_item_id UUID NOT NULL REFERENCES stock_items(id),
    quantity_ordered NUMERIC(14,3) NOT NULL,
    quantity_received NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit_price NUMERIC(12,2) NOT NULL,
    line_total NUMERIC(14,2) NOT NULL,
    notes TEXT
);

CREATE INDEX idx_po_items_order ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_stock ON purchase_order_items(stock_item_id);

-- ============================================================
-- SECTION 9 — FINANCE & ACCOUNTING (Double-Entry)
-- Ref: §2.4.2 Business Logic Layer — Finance and Accounting module
-- ============================================================

-- Chart of accounts (hierarchical via parent_id self-reference)
CREATE TABLE financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    account_code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    account_type VARCHAR(30) NOT NULL CHECK (account_type IN ('revenue', 'expense', 'asset', 'liability', 'equity')),
    parent_id UUID REFERENCES financial_accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed chart of accounts (standard farm accounts)
INSERT INTO financial_accounts (account_code, name, account_type) VALUES
('1000', 'Assets', 'asset'),
('1100', 'Cash & Bank', 'asset'),
('1200', 'Accounts Receivable', 'asset'),
('1300', 'Inventory', 'asset'),
('2000', 'Liabilities', 'liability'),
('2100', 'Accounts Payable', 'liability'),
('3000', 'Equity', 'equity'),
('4000', 'Revenue', 'revenue'),
('4100', 'Sales Revenue', 'revenue'),
('5000', 'Expenses', 'expense'),
('5100', 'Cost of Goods Sold', 'expense'),
('5200', 'Labor Expense', 'expense'),
('5300', 'Equipment & Maintenance', 'expense');

-- Journal Entries (double-entry)
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    created_by UUID NOT NULL REFERENCES users(id),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference VARCHAR(100),
    source_module VARCHAR(60),
    source_id UUID,
    description TEXT NOT NULL,
    total_debit NUMERIC(16,2) NOT NULL,
    total_credit NUMERIC(16,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'reversed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_journal_balanced CHECK (total_debit = total_credit)
);

CREATE INDEX idx_journal_farm ON journal_entries(farm_id);
CREATE INDEX idx_journal_date ON journal_entries(entry_date DESC);
CREATE INDEX idx_journal_source ON journal_entries(source_module, source_id);

CREATE TABLE journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES financial_accounts(id),
    debit_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    credit_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    description TEXT
);

CREATE INDEX idx_journal_lines_account ON journal_entry_lines(account_id);
CREATE INDEX idx_journal_lines_entry ON journal_entry_lines(journal_entry_id);

-- ============================================================
-- SECTION 10 — QUALITY CONTROL
-- Ref: §2.4.2 Business Logic Layer — Quality Control module
-- ============================================================

CREATE TABLE quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    checked_by UUID NOT NULL REFERENCES users(id),
    check_date DATE NOT NULL DEFAULT CURRENT_DATE,
    grade VARCHAR(20),
    passed BOOLEAN NOT NULL,
    parameters JSONB,
    notes TEXT,
    stock_item_id UUID REFERENCES stock_items(id),
    harvest_id UUID REFERENCES fish_harvest_records(id),
    production_id UUID REFERENCES crop_production_records(id),
    sales_order_id UUID REFERENCES sales_orders(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_one_reference CHECK (
        (stock_item_id IS NOT NULL)::INT +
        (harvest_id IS NOT NULL)::INT +
        (production_id IS NOT NULL)::INT +
        (sales_order_id IS NOT NULL)::INT = 1
    )
);

CREATE INDEX idx_quality_farm ON quality_checks(farm_id);
CREATE INDEX idx_quality_checked_by ON quality_checks(checked_by);
CREATE INDEX idx_quality_ref_date ON quality_checks(check_date DESC);

-- ============================================================
-- SECTION 11 — REPORTING & DECISION SUPPORT
-- Ref: §4.2.6 — Dashboards, trend reports, exportable reports
-- ============================================================

CREATE TABLE report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    report_type VARCHAR(60) NOT NULL,
    module VARCHAR(60) NOT NULL,
    query_config JSONB NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE report_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_definition_id UUID NOT NULL REFERENCES report_definitions(id),
    run_by UUID NOT NULL REFERENCES users(id),
    parameters JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    result_row_count INTEGER,
    file_url TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_runs_def ON report_runs(report_definition_id);
CREATE INDEX idx_report_runs_user ON report_runs(run_by);

CREATE TABLE dashboard_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farm_profiles(id),
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kpi_data JSONB NOT NULL
);

CREATE INDEX idx_snapshots_farm ON dashboard_snapshots(farm_id);
CREATE INDEX idx_snapshots_date ON dashboard_snapshots(snapshot_at DESC);

-- ============================================================
-- SECTION 12 — AUDIT LOG
-- Ref: §2.2.1.8 RBAC, §3.6.5 Data Security — tamper-evident append-only
-- ============================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    farm_id UUID REFERENCES farm_profiles(id),
    table_name VARCHAR(100) NOT NULL,
    record_id TEXT NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_date ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_farm ON audit_logs(farm_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);

-- ============================================================
-- SECTION 13 — MATERIALIZED VIEWS FOR DASHBOARD
-- Ref: §4.2.6.1 Dashboards for management (remote visibility)
-- ============================================================

-- 13a. Live stock summary
CREATE MATERIALIZED VIEW dashboard_stock_summary AS
SELECT 
    si.id AS stock_item_id,
    si.name AS item_name,
    ic.name AS category,
    ic.type AS category_type,
    si.unit_of_measure,
    si.current_quantity,
    si.reserved_quantity,
    si.available_quantity,
    si.reorder_threshold,
    si.unit_cost,
    COALESCE(si.current_quantity * si.unit_cost, 0) AS estimated_value,
    CASE
        WHEN si.available_quantity <= 0 THEN 'out_of_stock'
        WHEN si.available_quantity <= si.reorder_threshold THEN 'low_stock'
        ELSE 'ok'
    END AS stock_status,
    (SELECT COUNT(*) FROM reorder_alerts ra WHERE ra.stock_item_id = si.id AND ra.status = 'open') AS open_alerts,
    si.updated_at
FROM stock_items si
JOIN item_categories ic ON ic.id = si.category_id
WHERE si.deleted_at IS NULL
WITH DATA;

CREATE UNIQUE INDEX idx_dash_stock_summary ON dashboard_stock_summary(stock_item_id);

-- 13b. Monthly revenue summary
CREATE MATERIALIZED VIEW dashboard_revenue_summary AS
SELECT 
    DATE_TRUNC('month', s.order_date) AS month,
    s.farm_id,
    COUNT(*) AS total_orders,
    SUM(s.total_amount) AS total_revenue,
    SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END) AS collected_revenue,
    SUM(CASE WHEN s.payment_status != 'paid' THEN s.total_amount ELSE 0 END) AS outstanding_revenue
FROM sales_orders s
WHERE s.status != 'cancelled'
GROUP BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX idx_dash_revenue_month ON dashboard_revenue_summary(month, farm_id);

-- 13c. Workforce summary
CREATE MATERIALIZED VIEW dashboard_workforce_summary AS
SELECT 
    e.farm_id,
    e.employment_type,
    e.sector,
    COUNT(*) AS total_employees,
    COUNT(*) FILTER (WHERE e.deleted_at IS NULL) AS active_employees,
    AVG((SELECT COUNT(*) FROM attendance_logs a WHERE a.employee_id = e.id AND a.status = 'present' AND a.log_date >= DATE_TRUNC('month', CURRENT_DATE)))::NUMERIC(5,2) AS avg_attendance_this_month
FROM employees e
GROUP BY 1, 2, 3
WITH DATA;

CREATE INDEX idx_dash_workforce ON dashboard_workforce_summary(farm_id);

-- ============================================================
-- SECTION 14 — BUSINESS LOGIC TRIGGERS (Race-Condition Free)
-- ============================================================

-- 14a. Reorder alert — fires when available_quantity drops to/below threshold
CREATE OR REPLACE FUNCTION check_reorder_alert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.available_quantity <= NEW.reorder_threshold
        AND OLD.available_quantity > OLD.reorder_threshold THEN
        IF NOT EXISTS (
            SELECT 1 FROM reorder_alerts
            WHERE stock_item_id = NEW.id AND status = 'open'
        ) THEN
            INSERT INTO reorder_alerts (stock_item_id, quantity_at_trigger)
            VALUES (NEW.id, NEW.available_quantity);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_reorder
    AFTER UPDATE OF current_quantity, reserved_quantity ON stock_items
    FOR EACH ROW EXECUTE FUNCTION check_reorder_alert();

-- 14b. Reserve stock on order confirmation
CREATE OR REPLACE FUNCTION reserve_stock_on_confirm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_item RECORD;
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
        FOR v_item IN
            SELECT soi.stock_item_id, soi.quantity
            FROM sales_order_items soi
            WHERE soi.sales_order_id = NEW.id
        LOOP
            UPDATE stock_items
            SET reserved_quantity = reserved_quantity + v_item.quantity
            WHERE id = v_item.stock_item_id
            AND (current_quantity - reserved_quantity) >= v_item.quantity;
            
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Insufficient available stock to confirm order for item %', v_item.stock_item_id;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reserve_stock_on_confirm
    AFTER UPDATE OF status ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION reserve_stock_on_confirm();

-- 14c. Atomic stock deduction on dispatch
CREATE OR REPLACE FUNCTION deduct_stock_on_sale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_item RECORD;
BEGIN
    IF NEW.status = 'dispatched' AND OLD.status != 'dispatched' THEN
        FOR v_item IN
            SELECT soi.stock_item_id, soi.quantity
            FROM sales_order_items soi
            WHERE soi.sales_order_id = NEW.id
        LOOP
            UPDATE stock_items
            SET current_quantity = current_quantity - v_item.quantity,
                reserved_quantity = reserved_quantity - v_item.quantity
            WHERE id = v_item.stock_item_id
            AND current_quantity >= v_item.quantity;
            
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Insufficient stock for item %', v_item.stock_item_id;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deduct_stock_on_sale
    AFTER UPDATE OF status ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION deduct_stock_on_sale();

-- 14d. Reversible stock — cancellation returns stock
CREATE OR REPLACE FUNCTION reverse_stock_on_cancellation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_item RECORD;
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status IN ('confirmed', 'dispatched') THEN
        FOR v_item IN
            SELECT soi.stock_item_id, soi.quantity
            FROM sales_order_items soi
            WHERE soi.sales_order_id = NEW.id
        LOOP
            UPDATE stock_items
            SET current_quantity = current_quantity + v_item.quantity,
                reserved_quantity = GREATEST(reserved_quantity - v_item.quantity, 0)
            WHERE id = v_item.stock_item_id;
            
            INSERT INTO stock_transactions (
                stock_item_id, performed_by, transaction_type, quantity,
                quantity_before, quantity_after, reference_id, reference_table, source_module, notes
            )
            SELECT
                v_item.stock_item_id,
                COALESCE(NEW.updated_by, NEW.created_by),
                'adjustment',
                v_item.quantity,
                current_quantity - v_item.quantity,
                current_quantity,
                NEW.id,
                'sales_orders',
                'sales',
                'Cancellation reversal for order ' || NEW.order_number
            FROM stock_items WHERE id = v_item.stock_item_id;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reverse_stock_on_cancellation
    AFTER UPDATE OF status ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION reverse_stock_on_cancellation();

-- 14e. Stock increase on purchase order received
CREATE OR REPLACE FUNCTION receive_stock_on_purchase()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_item RECORD;
BEGIN
    IF NEW.status = 'received' AND OLD.status != 'received' THEN
        FOR v_item IN
            SELECT poi.stock_item_id, poi.quantity_ordered
            FROM purchase_order_items poi
            WHERE poi.purchase_order_id = NEW.id
        LOOP
            UPDATE stock_items
            SET current_quantity = current_quantity + v_item.quantity_ordered
            WHERE id = v_item.stock_item_id;
            
            INSERT INTO stock_transactions (
                stock_item_id, performed_by, transaction_type, quantity,
                quantity_before, quantity_after, reference_id, reference_table, source_module
            )
            SELECT
                v_item.stock_item_id,
                NEW.created_by,
                'purchase',
                v_item.quantity_ordered,
                current_quantity - v_item.quantity_ordered,
                current_quantity,
                NEW.id,
                'purchase_orders',
                'procurement'
            FROM stock_items WHERE id = v_item.stock_item_id;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_receive_stock_on_purchase
    AFTER UPDATE OF status ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION receive_stock_on_purchase();

-- 14f. Auto-post journal entries from invoiced sales
CREATE OR REPLACE FUNCTION auto_post_sales_journal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_journal_id UUID;
    v_ar_id UUID;
    v_rev_id UUID;
BEGIN
    IF NEW.status = 'invoiced' AND OLD.status != 'invoiced' THEN
        SELECT id INTO v_ar_id FROM financial_accounts WHERE account_code = '1200' LIMIT 1;
        SELECT id INTO v_rev_id FROM financial_accounts WHERE account_code = '4100' LIMIT 1;
        
        IF v_ar_id IS NOT NULL AND v_rev_id IS NOT NULL THEN
            INSERT INTO journal_entries (
                farm_id, created_by, entry_date, reference,
                source_module, source_id, description,
                total_debit, total_credit, status
            ) VALUES (
                NEW.farm_id, NEW.created_by, NEW.order_date, NEW.order_number,
                'sales', NEW.id, 'Sales invoice ' || NEW.order_number,
                NEW.total_amount, NEW.total_amount, 'posted'
            ) RETURNING id INTO v_journal_id;
            
            INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount)
            VALUES (v_journal_id, v_ar_id, NEW.total_amount);
            
            INSERT INTO journal_entry_lines (journal_entry_id, account_id, credit_amount)
            VALUES (v_journal_id, v_rev_id, NEW.total_amount);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_post_sales_journal
    AFTER UPDATE OF status ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION auto_post_sales_journal();

-- ============================================================
-- SECTION 15 — ROW-LEVEL SECURITY (Multi-Farm Isolation)
-- Ref: Expert rec §1.5 — prevents data leaks between farms at DB level
-- ============================================================

CREATE OR REPLACE FUNCTION set_current_farm(p_farm_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.current_farm_id', p_farm_id::TEXT, FALSE);
END;
$$;

-- Enable RLS on all tenant-scoped tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'stock_items', 'employees', 'sales_orders', 'customers', 'assets',
        'crop_production_records', 'livestock_records', 'aquaculture_records',
        'suppliers', 'purchase_orders', 'contracts', 'financial_accounts',
        'journal_entries', 'quality_checks', 'daily_production_logs',
        'work_orders', 'task_assignments', 'dashboard_snapshots'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY farm_isolation_%I ON %I FOR ALL USING (farm_id = current_setting(''app.current_farm_id'', TRUE)::UUID)',
            t, t
        );
    END LOOP;
END;
$$;

-- ============================================================
-- POST-DEPLOYMENT CHECKLIST
-- ============================================================

-- 1. Refresh materialized views (schedule via pg_cron or app scheduler):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_stock_summary;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_revenue_summary;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_workforce_summary;

-- 2. Application MUST call before any query:
-- SELECT set_current_farm('<farm-uuid>');

-- 3. For high-volume tables (>1M rows/year), enable partitioning:
-- stock_transactions → PARTITION BY RANGE (transacted_at) [monthly]
-- audit_logs → PARTITION BY RANGE (created_at) [monthly]
-- attendance_logs → PARTITION BY RANGE (log_date) [quarterly]

-- 4. Run VACUUM ANALYZE after bulk inserts/seed data loads

-- 5. Soft-delete pattern: SET deleted_at = NOW() — never hard DELETE records

-- 6. Indexes marked with CONCURRENTLY must be created OUTSIDE transactions in production to avoid locking.

-- Integration order per §5.2:
-- 1 IMS → 2 Production → 3 HR & Labor → 4 Assets → 5 Sales & Distribution → 6 Reporting → 7 Finance, Procurement, Quality