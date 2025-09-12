const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { exportId, projectIds, exportType, email } = await req.json()
    
    if (!exportId || !projectIds || projectIds.length === 0) {
      throw new Error('Missing required fields: exportId, projectIds')
    }

    // Update status to processing
    await updateExportStatus(exportId, 'processing')

    // Generate exports based on type
    let downloadUrl: string;
    
    switch (exportType) {
      case 'pdf':
        downloadUrl = await generatePDFExports(projectIds);
        break;
      case 'excel':
        downloadUrl = await generateExcelExport(projectIds);
        break;
      case 'zip':
        downloadUrl = await generateZIPPackage(projectIds);
        break;
      default:
        throw new Error(`Unsupported export type: ${exportType}`);
    }

    // Update status to completed
    await updateExportStatus(exportId, 'completed', downloadUrl)

    // Send email if provided
    if (email) {
      await sendDownloadEmail(email, downloadUrl, exportType, projectIds.length);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        downloadUrl,
        exportId,
        message: `Export completed for ${projectIds.length} project(s)`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Batch export error:', error)
    
    // Update status to failed
    if (req.json && (await req.json()).exportId) {
      await updateExportStatus((await req.json()).exportId, 'failed', null, error.message);
    }
    
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

async function updateExportStatus(
  exportId: string, 
  status: string, 
  downloadUrl?: string | null, 
  errorMessage?: string
) {
  // In real implementation, would update Supabase
  console.log('Updating export status:', { exportId, status, downloadUrl, errorMessage });
}

async function generatePDFExports(projectIds: string[]): Promise<string> {
  // Mock PDF generation - in real app would:
  // 1. Fetch project data from Supabase
  // 2. Generate PDFs using @react-pdf/renderer
  // 3. Combine into ZIP if multiple projects
  // 4. Upload to Supabase Storage
  // 5. Return public URL
  
  console.log('Generating PDF exports for projects:', projectIds);
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Return mock download URL
  return `https://example.com/exports/pdf-export-${Date.now()}.pdf`;
}

async function generateExcelExport(projectIds: string[]): Promise<string> {
  console.log('Generating Excel export for projects:', projectIds);
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return `https://example.com/exports/excel-export-${Date.now()}.xlsx`;
}

async function generateZIPPackage(projectIds: string[]): Promise<string> {
  console.log('Generating ZIP package for projects:', projectIds);
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  return `https://example.com/exports/zip-package-${Date.now()}.zip`;
}

async function sendDownloadEmail(
  email: string, 
  downloadUrl: string, 
  exportType: string, 
  projectCount: number
) {
  console.log('Sending download email:', { email, downloadUrl, exportType, projectCount });
  
  // In real implementation, would send email via service like Resend
  const emailContent = {
    to: email,
    subject: `Your ${exportType.toUpperCase()} export is ready`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Export Complete</h2>
        <p>Your export of ${projectCount} project(s) is ready for download.</p>
        <div style="margin: 20px 0;">
          <a href="${downloadUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Download ${exportType.toUpperCase()}
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          This download link will expire in 7 days. Please save the file to your device.
        </p>
      </div>
    `
  };
  
  // Mock email send
  return true;
}