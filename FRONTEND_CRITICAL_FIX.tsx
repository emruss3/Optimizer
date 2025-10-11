// =====================================================
// CRITICAL FRONTEND FIX - Load Basic Parcel Geometry
// =====================================================

// The main issue: The code only loads buildableEnvelope but never loads parcelGeometry
// This is why nothing shows on the canvas

// ADD THIS CODE to the loadParcelGeometry function in EnterpriseSitePlanner.tsx
// Replace the existing loadParcelGeometry function with this:

const loadParcelGeometry = async () => {
  try {
    console.log('🏗️ Loading parcel geometry for OGC_FID:', parcel.ogc_fid);
    
    // STEP 1: Load basic parcel geometry first (this is what shows on canvas)
    console.log('📍 Step 1: Loading basic parcel geometry...');
    const basicGeometryData = await fetchParcelGeometry3857(parcel.ogc_fid);
    console.log('📍 Basic geometry data:', basicGeometryData);
    
    if (basicGeometryData) {
      const parsedGeometry = parseGeometryForSitePlanner(basicGeometryData);
      console.log('📍 Parsed basic geometry:', parsedGeometry);
      setParcelGeometry(parcelGeometry); // THIS WAS MISSING!
      
      // Set parcel bounds for the canvas
      setParcelBounds({
        width: parsedGeometry.width,
        height: parsedGeometry.depth
      });
    } else {
      console.warn('⚠️ No basic geometry data found for parcel:', parcel.ogc_fid);
    }
    
    // STEP 2: Try to load roads (non-blocking)
    try {
      // Check if roads exist in database
      const { data: roadCheck, error: roadError } = await supabase
        .from('roads')
        .select('id')
        .limit(1);
      
      if (roadError && roadError.message.includes('does not exist')) {
        console.warn('⚠️ Roads table not found - skipping road import');
      } else if (!roadCheck || roadCheck.length === 0) {
        console.log('📍 No roads in database, importing from OpenStreetMap...');
        try {
          const roadImportResult = await checkAndImportOSMRoads(parcel.ogc_fid);
          console.log('🔍 Road import result:', roadImportResult);
          if (roadImportResult.success) {
            console.log('✅ Roads auto-imported successfully:', roadImportResult.message);
          } else {
            console.warn('⚠️ Road auto-import failed:', roadImportResult.error);
          }
        } catch (roadImportError) {
          console.warn('⚠️ Road import error (non-blocking):', roadImportError);
        }
      } else {
        console.log('✅ Roads already available in database');
      }
    } catch (roadError) {
      console.warn('⚠️ Road check/import error:', roadError);
    }
    
    // STEP 3: Load buildable envelope (optional enhancement)
    console.log('📍 Step 3: Loading buildable envelope...');
    const envelopeData = await fetchParcelBuildableEnvelope(parcel.ogc_fid);
    console.log('📍 Envelope data:', envelopeData);
    
    if (envelopeData) {
      const parsedEnvelope = parseBuildableEnvelopeForSitePlanner(envelopeData);
      console.log('📍 Parsed envelope:', parsedEnvelope);
      setBuildableEnvelope(parcelGeometry); // Set the buildable envelope
      setEdgeClassifications(envelopeData.edge_types);
      
      console.log('🔍 Envelope data structure:', {
        ogc_fid: envelopeData.ogc_fid,
        area_sqft: envelopeData.area_sqft,
        edge_types: envelopeData.edge_types,
        setbacks_applied: envelopeData.setbacks_applied
      });
    } else {
      console.warn('⚠️ No envelope data found for parcel:', parcel.ogc_fid);
    }
    
    console.log('✅ Parcel geometry loading completed successfully!');
    
  } catch (error) {
    console.error('❌ Error loading parcel geometry:', error);
  }
};

// =====================================================
// ADDITIONAL FIXES NEEDED:
// =====================================================

// 1. Fix the OSM query in src/services/osmRoads.ts
// Replace the overpassQuery with:
const overpassQuery = `[out:json][timeout:25];
(way["highway"~"^(primary|secondary|tertiary|residential|trunk|unclassified)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out geom;`;

// 2. Make sure the useEffect that depends on parcelGeometry is triggered
// The useEffect at line 2800 should now work because parcelGeometry will be set

// 3. Verify that the canvas rendering logic uses parcelGeometry
// The canvas should render parcelGeometry.coordinates to show the parcel boundary

