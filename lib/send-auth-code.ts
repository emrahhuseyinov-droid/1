import { Resend } from 'resend'

type AuthCodeType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'

type SendAuthCodeInput = {
  email: string
  otp: string
  type: AuthCodeType
}

const emailCopy: Record<AuthCodeType, { subject: string; message: string }> = {
  'sign-in': {
    subject: 'Your pepe.casa sign-in code',
    message: 'Use this code to sign in to your pepe.casa account.',
  },
  'email-verification': {
    subject: 'Verify your pepe.casa email',
    message: 'Use this code to verify your pepe.casa email address.',
  },
  'forget-password': {
    subject: 'Reset your pepe.casa password',
    message: 'Use this code to reset your pepe.casa password.',
  },
  'change-email': {
    subject: 'Confirm your pepe.casa email change',
    message: 'Use this code to confirm your pepe.casa email change.',
  },
}

export async function sendAuthCodeEmail({ email, otp, type }: SendAuthCodeInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const emailDomain = process.env.RESEND_EMAIL_DOMAIN?.trim().toLowerCase()

  if (!apiKey) {
    console.error('[auth-email] RESEND_API_KEY is not configured.')
    throw new Error('Email delivery is not configured.')
  }

  if (!emailDomain || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(emailDomain)) {
    console.error('[auth-email] RESEND_EMAIL_DOMAIN is missing or invalid.')
    throw new Error('Email sender is not configured.')
  }

  let response
  try {
    response = await new Resend(apiKey).emails.send({
      from: `pepe.casa <no-reply@${emailDomain}>`,
      to: [email],
      subject: emailCopy[type].subject,
      text: `${emailCopy[type].message} Your one-time code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h1 style="font-size:20px">${emailCopy[type].subject}</h1><p>${emailCopy[type].message}</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p></div>`,
    })
  } catch (error) {
    console.error('[auth-email] Resend request failed.', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    throw new Error('Could not send authentication email.')
  }

  if (response.error) {
    console.error('[auth-email] Resend rejected an authentication email.', {
      name: response.error.name,
      statusCode: response.error.statusCode,
    })
    throw new Error('Could not send authentication email.')
  }

  if (!response.data?.id) {
    console.error('[auth-email] Resend returned no message ID for an authentication email.')
    throw new Error('Could not send authentication email.')
  }
}
