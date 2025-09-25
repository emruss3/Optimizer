/* Supabase Edge Function to import roads from Mapbox (server-side, no CORS issues) */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { ogcFid, mapboxToken } = await req.json()
    
    if (!ogcFid || !mapboxToken) {
      return new Response(
        JSON.stringify({ error: 'Missing ogcFid or mapboxToken' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`🗺️ Importing roads for parcel ${ogcFid}`)

    // Get parcel geometry
    const { data: parcelData, error: parcelError } = await supabase
      .from('parcels')
      .select('ogc_fid, wkb_geometry_4326, address')
      .eq('ogc_fid', ogcFid)
      .single()

    if (parcelError) {
      throw new Error(`Failed to get parcel: ${parcelError.message}`)
    }

    // Parse parcel geometry to get centroid
    let geometry
    if (typeof parcelData.wkb_geometry_4326 === 'string') {
      geometry = JSON.parse(parcelData.wkb_geometry_4326)
    } else {
      geometry = parcelData.wkb_geometry_4326
    }

    if (!geometry || !geometry.coordinates) {
      throw new Error('Invalid parcel geometry')
    }

    const coordinates = geometry.coordinates[0]
    const centerLon = coordinates.reduce((sum: number, coord: number[]) => sum + coord[0], 0) / coordinates.length
    const centerLat = coordinates.reduce((sum: number, coord: number[]) => sum + coord[1], 0) / coordinates.length

    console.log(`📍 Parcel center: ${centerLon}, ${centerLat}`)

    // Fetch roads from Mapbox Tilequery API (server-side, no CORS issues)
    const radius = 500 // 500 meter search radius
    const mapboxUrl = `https://api.mapbox.com/tilequery/v1/mapbox.mapbox-streets-v8/tilequery/${centerLon},${centerLat}.json?radius=${radius}&layers=road&limit=50&access_token=${mapboxToken}`

    console.log('🛣️ Fetching roads from Mapbox...')
    
    const mapboxResponse = await fetch(mapboxUrl)
    if (!mapboxResponse.ok) {
      const errorText = await mapboxResponse.text()
      throw new Error(`Mapbox API error: ${mapboxResponse.status} ${errorText}`)
    }

    const mapboxData = await mapboxResponse.json()
    console.log(`✅ Found ${mapboxData.features.length} roads`)

    // Process and insert roads
    const roadInserts = []
    for (const feature of mapboxData.features) {
      if (feature.geometry.type === 'LineString') {
        const roadData = {
          osm_id: feature.properties.id || Math.floor(Math.random() * 1000000),
          name: feature.properties.name || feature.properties.class || 'Unnamed Road',
          highway: feature.properties.class || 'unknown',
          geom: `LINESTRING(${feature.geometry.coordinates.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(',')})`
        }
        roadInserts.push(roadData)
      }
    }

    // Insert roads using the insert_road function
    let successCount = 0
    for (const road of roadInserts) {
      const { data, error } = await supabase.rpc('insert_road', {
        p_osm_id: road.osm_id,
        p_name: road.name,
        p_highway: road.highway,
        p_geom_wkt: road.geom
      })

      if (!error) {
        successCount++
        console.log(`✅ Inserted: ${road.name} (${road.highway})`)
      } else {
        console.error(`❌ Failed to insert ${road.name}:`, error)
      }
    }

    const roadNames = roadInserts.map(r => r.name).filter(name => name !== 'Unnamed Road')
    
    return new Response(
      JSON.stringify({
        success: true,
        roadsImported: successCount,
        totalFound: mapboxData.features.length,
        roadNames: roadNames,
        parcelAddress: parcelData.address
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error importing roads:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
