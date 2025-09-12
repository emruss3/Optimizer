const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, projectId, projectName, role, inviteUrl, message } = await req.json()
    
    if (!email || !projectId || !projectName) {
      throw new Error('Missing required fields: email, projectId, projectName')
    }

    // In a real implementation, you would:
    // 1. Use a proper email service (SendGrid, Resend, etc.)
    // 2. Use email templates
    // 3. Track email delivery status
    
    // For demo, we'll just log the invitation details
    console.log('Sending invitation:', {
      to: email,
      projectId,
      projectName,
      role,
      inviteUrl,
      message
    })

    // Mock email content
    const emailContent = {
      to: email,
      subject: `You've been invited to join "${projectName}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Project Invitation</h2>
          <p>You've been invited to collaborate on the project: <strong>${projectName}</strong></p>
          <p>Role: <strong>${role}</strong></p>
          ${message ? `<p>Message: "${message}"</p>` : ''}
          <div style="margin: 20px 0;">
            <a href="${inviteUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            This invitation will expire in 7 days. If you have any questions, please contact the project manager.
          </p>
        </div>
      `
    }

    // Here you would integrate with your email provider
    // Example with Resend:
    // const response = await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     from: 'noreply@yourapp.com',
    //     to: email,
    //     subject: emailContent.subject,
    //     html: emailContent.html
    //   })
    // })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invitation sent successfully',
        emailContent // For demo purposes
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Invite send error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})