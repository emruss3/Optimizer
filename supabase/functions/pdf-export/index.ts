const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// PDF memory limits
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
const MEMORY_LIMIT = 1024; // 1GB in MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { projectData, reportType = 'summary' } = await req.json()
    
    if (!projectData) {
      throw new Error('Project data is required')
    }

    // Create PDF document based on report type
    const Document = () => React.createElement(
      ReactPDF.Document,
      {},
      React.createElement(
        ReactPDF.Page,
        { size: 'A4', style: { padding: 30 } },
        React.createElement(
          ReactPDF.Text,
          { style: { fontSize: 24, marginBottom: 20 } },
          `${reportType.toUpperCase()} Report`
        ),
        React.createElement(
          ReactPDF.Text,
          { style: { fontSize: 12 } },
          `Project: ${projectData.name || 'Unnamed Project'}`
        ),
        React.createElement(
          ReactPDF.Text,
          { style: { fontSize: 12, marginTop: 10 } },
          `Parcels: ${projectData.parcels?.length || 0}`
        ),
        React.createElement(
          ReactPDF.Text,
          { style: { fontSize: 12, marginTop: 10 } },
          `Generated: ${new Date().toLocaleString()}`
        )
      )
    )

    // Estimate size and choose rendering method
    const estimatedSize = JSON.stringify(projectData).length * 10; // Rough estimation
    
    if (estimatedSize > MAX_BUFFER_SIZE) {
      // Stream large PDFs
      const stream = await ReactPDF.renderToStream(
        React.createElement(Document),
        { memoryLimit: MEMORY_LIMIT }
      )
      
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${projectData.name || 'report'}.pdf"`,
        },
      })
    } else {
      // Buffer smaller PDFs
      const pdfBuffer = await ReactPDF.renderToBuffer(
        React.createElement(Document),
        { memoryLimit: MEMORY_LIMIT }
      )
      
      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${projectData.name || 'report'}.pdf"`,
        },
      })
    }

  } catch (error) {
    console.error('PDF generation error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
import React from 'npm:react@18.2.0'
import ReactPDF from 'npm:@react-pdf/renderer@3.1.12'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// PDF memory limits
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
const MEMORY_LIMIT = 1024; // 1GB in MB

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { projectData, reportType = 'summary' } = await req.json()
    
    if (!projectData) {
      throw new Error('Project data is required')
    }

    // Create PDF document based on report type
    const Document = () => React.createElement(
      ReactPDF.Document,
      {},
      React.createElement(
        ReactPDF.Page,
        { size: 'A4', style: { padding: 30 } },
        React.createElement(
          ReactPDF.Text,
          { style: { fontSize: 24, marginBottom: 20 } },
          `${reportType.toUpperCase()} Report`
        ),
        React.createElement(
          ReactPDF.Text,
          { style: { fontSize: 12 } },
          `Project: ${projectData.name || 'Unnamed Project'}`
        ),
        React.createElement(
          ReactPDF.Text,
          { style: { fontSize: 12, marginTop: 10 } },
          `Parcels: ${projectData.parcels?.length || 0}`
        ),
        React.createElement(
          ReactPDF.Text,
          { style: { fontSize: 12, marginTop: 10 } },
          `Generated: ${new Date().toLocaleString()}`
        )
      )
    )

    // Estimate size and choose rendering method
    const estimatedSize = JSON.stringify(projectData).length * 10; // Rough estimation
    
    if (estimatedSize > MAX_BUFFER_SIZE) {
      // Stream large PDFs
      const stream = await ReactPDF.renderToStream(
        React.createElement(Document),
        { memoryLimit: MEMORY_LIMIT }
      )
      
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${projectData.name || 'report'}.pdf"`,
        },
      })
    } else {
      // Buffer smaller PDFs
      const pdfBuffer = await ReactPDF.renderToBuffer(
        React.createElement(Document),
        { memoryLimit: MEMORY_LIMIT }
      )
      
      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${projectData.name || 'report'}.pdf"`,
        },
      })
    }

  } catch (error) {
    console.error('PDF generation error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})