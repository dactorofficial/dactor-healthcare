-- =========================================================================
-- DACTOR PLATFORM - GEOHASHING & SPATIAL DISCOVERY MIGRATION SCRIPT
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/ojfoofojcpabqegxmsab/sql)
-- =========================================================================

-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Add Geohash and Geography Columns to Clinics Table
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS geohash VARCHAR(12);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS location_geom GEOGRAPHY(Point, 4326);

-- 3. Create Spatial & Prefix B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_clinics_geohash ON clinics (geohash);
CREATE INDEX IF NOT EXISTS idx_clinics_location_geom ON clinics USING GIST (location_geom);

-- 4. Pure PL/pgSQL Fallback Geohash Encoder (Precision 1-12)
CREATE OR REPLACE FUNCTION dactor_encode_geohash(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    precision_len INT DEFAULT 9
)
RETURNS TEXT AS $$
DECLARE
    base32_chars TEXT := '0123456789bcdefghjkmnpqrstuvwxyz';
    min_lat DOUBLE PRECISION := -90.0;
    max_lat DOUBLE PRECISION := 90.0;
    min_lng DOUBLE PRECISION := -180.0;
    max_lng DOUBLE PRECISION := 180.0;
    mid DOUBLE PRECISION;
    is_even BOOLEAN := TRUE;
    ch INT := 0;
    bit_count INT := 0;
    result TEXT := '';
BEGIN
    IF lat IS NULL OR lng IS NULL THEN
        RETURN NULL;
    END IF;

    -- Clamp coordinates
    lat := GREATEST(-90.0, LEAST(90.0, lat));
    lng := GREATEST(-180.0, LEAST(180.0, lng));

    WHILE LENGTH(result) < precision_len LOOP
        IF is_even THEN
            mid := (min_lng + max_lng) / 2.0;
            IF lng >= mid THEN
                ch := (ch << 1) | 1;
                min_lng := mid;
            ELSE
                ch := (ch << 1);
                max_lng := mid;
            END IF;
        ELSE
            mid := (min_lat + max_lat) / 2.0;
            IF lat >= mid THEN
                ch := (ch << 1) | 1;
                min_lat := mid;
            ELSE
                ch := (ch << 1);
                max_lat := mid;
            END IF;
        END IF;

        is_even := NOT is_even;
        bit_count := bit_count + 1;

        IF bit_count = 5 THEN
            result := result || SUBSTRING(base32_chars FROM (ch + 1) FOR 1);
            bit_count := 0;
            ch := 0;
        END IF;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Trigger Function to Automatically Compute Geohash and Geography Point
CREATE OR REPLACE FUNCTION compute_clinic_geohash()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        -- Standardize coordinates within valid ranges
        NEW.latitude := GREATEST(-90.0, LEAST(90.0, NEW.latitude));
        NEW.longitude := GREATEST(-180.0, LEAST(180.0, NEW.longitude));

        -- 1. Populate PostGIS geography point
        BEGIN
            NEW.location_geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
        EXCEPTION WHEN OTHERS THEN
            NEW.location_geom := NULL;
        END;

        -- 2. Populate standard Base32 Geohash (Precision 9 ~ 4.8m resolution)
        BEGIN
            NEW.geohash := ST_GeoHash(ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326), 9);
        EXCEPTION WHEN OTHERS THEN
            -- Fallback to pure PL/pgSQL function if PostGIS function is unavailable
            NEW.geohash := dactor_encode_geohash(NEW.latitude::DOUBLE PRECISION, NEW.longitude::DOUBLE PRECISION, 9);
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Attach Trigger to clinics Table
DROP TRIGGER IF EXISTS trg_calculate_clinic_geohash ON clinics;
CREATE TRIGGER trg_calculate_clinic_geohash
BEFORE INSERT OR UPDATE OF latitude, longitude ON clinics
FOR EACH ROW
EXECUTE FUNCTION compute_clinic_geohash();

-- 7. Backfill Existing Clinics
UPDATE clinics
SET
    latitude = latitude,
    longitude = longitude
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- 8. High-Performance Proximity RPC Function for Mobile and Web
CREATE OR REPLACE FUNCTION get_nearby_clinics(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 30.0,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0,
    p_search_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    type clinic_type_enum,
    verification_status verification_status_enum,
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    address_text TEXT,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    geohash VARCHAR(12),
    description TEXT,
    logo_url TEXT,
    pictures TEXT[],
    is_activated BOOLEAN,
    distance_km DOUBLE PRECISION
) AS $$
DECLARE
    user_point GEOGRAPHY;
    search_term TEXT;
BEGIN
    -- Clamp user coordinates and construct Point
    p_lat := GREATEST(-90.0, LEAST(90.0, p_lat));
    p_lng := GREATEST(-180.0, LEAST(180.0, p_lng));
    user_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

    IF p_search_query IS NOT NULL AND LENGTH(TRIM(p_search_query)) > 0 THEN
        search_term := '%' || LOWER(TRIM(p_search_query)) || '%';
    ELSE
        search_term := NULL;
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.type,
        c.verification_status,
        c.contact_phone,
        c.contact_email,
        c.address_text,
        c.latitude,
        c.longitude,
        c.geohash,
        c.description,
        c.logo_url,
        c.pictures,
        c.is_activated,
        ROUND((ST_Distance(c.location_geom, user_point) / 1000.0)::NUMERIC, 2)::DOUBLE PRECISION AS distance_km
    FROM clinics c
    WHERE
        c.is_archived = FALSE
        AND (c.verification_status = 'approved' OR c.verification_status IS NULL)
        AND (c.is_activated = TRUE OR c.is_activated IS NULL)
        AND c.location_geom IS NOT NULL
        -- If radius is specified, use PostGIS GiST index scan (ST_DWithin)
        AND (p_radius_km IS NULL OR ST_DWithin(c.location_geom, user_point, p_radius_km * 1000.0))
        -- Optional keyword search filter
        AND (search_term IS NULL OR LOWER(c.name) LIKE search_term OR LOWER(c.address_text) LIKE search_term)
    ORDER BY
        distance_km ASC
    LIMIT GREATEST(1, LEAST(100, p_limit))
    OFFSET GREATEST(0, p_offset);
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION get_nearby_clinics TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION dactor_encode_geohash TO authenticated, anon, service_role;
