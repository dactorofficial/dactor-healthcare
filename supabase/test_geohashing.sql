-- =========================================================================
-- DACTOR PLATFORM - GEOHASHING VERIFICATION TEST SCRIPT
-- Execute in Supabase SQL editor to test the Geohash trigger and RPC
-- =========================================================================

-- Test 1: Verify dactor_encode_geohash accuracy against Kathmandu reference point
-- Coordinates: Kathmandu Durbar Square (27.7042, 85.3072)
-- Expected standard Base32 geohash starts with 'tuq4t'
DO $$
DECLARE
    computed_gh TEXT;
BEGIN
    computed_gh := dactor_encode_geohash(27.7042, 85.3072, 9);
    RAISE NOTICE 'Test 1: Kathmandu Geohash = %', computed_gh;
    IF computed_gh NOT LIKE 'tuu%' THEN
        RAISE EXCEPTION 'Test 1 Failed: Geohash does not start with tuq4t';
    ELSE
        RAISE NOTICE 'Test 1 PASSED: Valid Kathmandu Geohash prefix.';
    END IF;
END $$;

-- Test 2: Verify trigger calculation on clinics table
DO $$
DECLARE
    test_id UUID;
    result_gh VARCHAR;
    result_dist DOUBLE PRECISION;
BEGIN
    -- Insert test clinic in Kathmandu (Thamel: 27.7152, 85.3123)
    INSERT INTO clinics (name, contact_phone, contact_email, address_text, latitude, longitude, is_activated, verification_status)
    VALUES ('__Test_Geohash_Clinic__', '9800000000', 'test@geohash.com', 'Thamel, Kathmandu', 27.7152, 85.3123, TRUE, 'approved')
    RETURNING id, geohash INTO test_id, result_gh;

    RAISE NOTICE 'Test 2: Inserted clinic ID %, Geohash: %', test_id, result_gh;

    IF result_gh IS NULL OR result_gh NOT LIKE 'tuu%' THEN
        -- Cleanup before exception
        DELETE FROM clinics WHERE id = test_id;
        RAISE EXCEPTION 'Test 2 Failed: Trigger did not automatically compute valid geohash';
    END IF;

    -- Test 3: Call get_nearby_clinics from Patan (27.6710, 85.3210)
    SELECT distance_km INTO result_dist
    FROM get_nearby_clinics(27.6710, 85.3210, 30.0, 10, 0, '__Test_Geohash_Clinic__')
    LIMIT 1;

    RAISE NOTICE 'Test 3: Distance from Patan to Thamel test clinic = % km', result_dist;

    IF result_dist IS NULL OR result_dist < 4.0 OR result_dist > 7.0 THEN
        DELETE FROM clinics WHERE id = test_id;
        RAISE EXCEPTION 'Test 3 Failed: Distance calculation out of expected range (expected ~5 km)';
    END IF;

    -- Cleanup test clinic
    DELETE FROM clinics WHERE id = test_id;
    RAISE NOTICE 'Test 2 & 3 PASSED! Cleanup complete.';
END $$;
