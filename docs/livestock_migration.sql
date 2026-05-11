-- AMIS Livestock Module Migration
-- Run: psql -U postgres -d AMIS_DB -f docs/livestock_migration.sql

CREATE TABLE IF NOT EXISTS pigs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL,
    pig_id VARCHAR(60) NOT NULL,
    breed VARCHAR(100),
    gender VARCHAR(20) NOT NULL DEFAULT 'unknown',
    status VARCHAR(20) NOT NULL DEFAULT 'healthy',
    pen_number VARCHAR(60),
    date_recorded DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (farm_id, pig_id)
);

CREATE TABLE IF NOT EXISTS cattle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL,
    cattle_id VARCHAR(60) NOT NULL,
    cattle_type VARCHAR(20) NOT NULL DEFAULT 'cow',
    status VARCHAR(20) NOT NULL DEFAULT 'healthy',
    location VARCHAR(200),
    date_recorded DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (farm_id, cattle_id)
);

CREATE TABLE IF NOT EXISTS birds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL,
    bird_type VARCHAR(20) NOT NULL DEFAULT 'chicken',
    batch_number VARCHAR(80) NOT NULL,
    number_of_birds INTEGER NOT NULL DEFAULT 0,
    number_of_female INTEGER NOT NULL DEFAULT 0,
    number_of_male INTEGER NOT NULL DEFAULT 0,
    date_recorded DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fish_ponds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL,
    pond_id VARCHAR(60) NOT NULL,
    length_m NUMERIC(10,2),
    width_m NUMERIC(10,2),
    location VARCHAR(200),
    capacity INTEGER NOT NULL DEFAULT 2000,
    current_fish_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (farm_id, pond_id)
);

CREATE TABLE IF NOT EXISTS fish_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL,
    pond_id UUID NOT NULL,
    fish_type VARCHAR(100) NOT NULL,
    batch_number VARCHAR(80) NOT NULL,
    number_of_fish INTEGER NOT NULL DEFAULT 0,
    date_recorded DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mortality_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL,
    livestock_type VARCHAR(20) NOT NULL,
    breed_or_type VARCHAR(100),
    record_id VARCHAR(60),
    pen_or_location VARCHAR(100),
    cause_of_death TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'dead',
    date_recorded DATE NOT NULL DEFAULT CURRENT_DATE,
    source_table VARCHAR(30),
    source_id UUID,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_pigs_farm ON pigs(farm_id);
CREATE INDEX IF NOT EXISTS idx_cattle_farm ON cattle(farm_id);
CREATE INDEX IF NOT EXISTS idx_birds_farm ON birds(farm_id);
CREATE INDEX IF NOT EXISTS idx_fish_ponds_farm ON fish_ponds(farm_id);
CREATE INDEX IF NOT EXISTS idx_fish_stock_pond ON fish_stock(pond_id);
CREATE INDEX IF NOT EXISTS idx_mortality_farm ON mortality_records(farm_id);
CREATE INDEX IF NOT EXISTS idx_mortality_type ON mortality_records(livestock_type);
